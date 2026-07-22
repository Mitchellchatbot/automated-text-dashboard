/**
 * Supabase Edge Function: blooio-webhook
 *
 * Receives Blooio events (inbound messages + delivery status). Its job for
 * compliance: when an inbound message is STOP/UNSUBSCRIBE, add the sender's phone
 * to the suppression list; when START, reactivate it. Every inbound message is
 * stored, and outbound delivery statuses are reflected onto message_log.
 *
 * Public endpoint (verify_jwt = false) — Blooio can't present a Supabase JWT — so
 * it is protected by verifying Blooio's HMAC-SHA256 signature over the raw body.
 *
 * Deploy:  supabase functions deploy blooio-webhook --no-verify-jwt
 * Secret:  supabase secrets set BLOOIO_WEBHOOK_SECRET=<signing_secret from Blooio>
 */

import { createClient } from "npm:@supabase/supabase-js@2.110.5";
import {
  parseSignatureHeader,
  classifyEvent,
  classifyKeyword,
} from "./lib.ts";

const MAX_BODY_BYTES = 1_000_000;
const TOLERANCE_SEC = 300; // reject signatures older than 5 minutes (replay guard)

const SIGNING_SECRET = Deno.env.get("BLOOIO_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const enc = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function bytesToB64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
function b64ToBytes(s: string): Uint8Array | null {
  try {
    return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmac(keyBytes: Uint8Array, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Candidate HMAC keys for a Blooio/Svix-style secret. We don't have a live sample
 * to confirm the exact convention, so accept either the literal secret string or
 * the base64 bytes after a `whsec_` prefix — a caller still needs the secret, so
 * forgeries can't pass regardless.
 */
function candidateKeys(secret: string): Uint8Array[] {
  const keys: Uint8Array[] = [enc.encode(secret)];
  if (secret.startsWith("whsec_")) {
    const decoded = b64ToBytes(secret.slice("whsec_".length));
    if (decoded) keys.push(decoded);
  }
  return keys;
}

async function verify(rawBody: string, header: string | null, nowSec: number): Promise<boolean> {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (Math.abs(nowSec - parsed.t) > TOLERANCE_SEC) return false; // replay guard

  const message = `${parsed.t}.${rawBody}`;
  const sig = parsed.v1;
  for (const key of candidateKeys(SIGNING_SECRET)) {
    const mac = await hmac(key, message);
    if (safeEqual(sig.toLowerCase(), bytesToHex(mac))) return true; // hex encoding
    if (safeEqual(sig, bytesToB64(mac))) return true; // base64 encoding
  }
  return false;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  if (!SIGNING_SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("blooio-webhook misconfigured: missing secret or Supabase env");
    return json({ ok: false, error: "server not configured" }, 500);
  }

  const rawBody = await req.text();
  if (rawBody.length > MAX_BODY_BYTES) return json({ ok: false, error: "payload too large" }, 413);

  // Verify signature over the RAW body (parsing first would break the HMAC).
  const nowSec = Math.floor(Date.now() / 1000);
  if (!(await verify(rawBody, req.headers.get("X-Blooio-Signature"), nowSec))) {
    return json({ ok: false, error: "bad signature" }, 401);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const evt = classifyEvent(payload);

  try {
    if (evt.kind === "inbound") {
      const phone = evt.phone;
      // Store the inbound message (audit + conversation thread).
      await supabase.from("inbound_messages").insert({
        phone_number: phone ?? "unknown",
        provider_message_id: evt.providerMessageId,
        body: evt.text,
        raw: payload as Record<string, unknown>,
      });

      const keyword = classifyKeyword(evt.text);
      if (phone && keyword === "stop") {
        await supabase.from("message_suppressions").upsert(
          {
            phone_number: phone,
            opted_out: true,
            reason: "STOP",
            source: "inbound",
            last_inbound: evt.text,
          },
          { onConflict: "phone_number" },
        );
        console.log(`opt-out recorded for ${phone}`);
      } else if (phone && keyword === "start") {
        await supabase.from("message_suppressions").upsert(
          {
            phone_number: phone,
            opted_out: false,
            reason: "START",
            source: "inbound",
            last_inbound: evt.text,
          },
          { onConflict: "phone_number" },
        );
        console.log(`opt-in (reactivate) recorded for ${phone}`);
      }
    } else if (evt.kind === "status" && evt.providerMessageId) {
      await supabase
        .from("message_log")
        .update({ status: evt.status })
        .eq("provider_message_id", evt.providerMessageId);
    }
  } catch (e) {
    // Log detail server-side; ack anyway so Blooio doesn't retry-storm.
    console.error("blooio-webhook processing error:", e instanceof Error ? e.message : e);
  }

  return json({ ok: true });
});
