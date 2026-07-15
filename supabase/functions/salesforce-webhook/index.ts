/**
 * Supabase Edge Function: salesforce-webhook
 *
 * Receives the daily bulk POST of discharged clients from Zapier and upserts
 * them into villa_alumni. Public endpoint (verify_jwt = false) protected by a
 * shared secret. Uses the service_role key (auto-injected) so it bypasses RLS.
 *
 * Deploy:  supabase functions deploy salesforce-webhook --no-verify-jwt
 * Secret:  supabase secrets set WEBHOOK_SECRET=<strong-random-value>
 */

// Pinned npm: specifier (registry resolution) rather than an esm.sh CDN URL, so
// a CDN/transitive compromise can't inject code into this service_role function.
import { createClient } from "npm:@supabase/supabase-js@2.110.5";
import {
  normalizeBatch,
  dischargeDateWarning,
  type NormalizedRecord,
} from "./lib.ts";

const MAX_BODY_BYTES = 5_000_000; // ~5 MB
const MAX_RECORDS = 50_000; // cap the batch so it can't fan out to unbounded RPCs
const CHUNK_SIZE = 500;

const SECRET = Deno.env.get("WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return new Uint8Array(digest);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Constant-time secret check; both sides hashed to a fixed length first. */
async function secretMatches(provided: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(provided), sha256(SECRET)]);
  return timingSafeEqual(a, b);
}

/**
 * Read the request body while enforcing a true byte cap by streaming — never
 * trusting the client Content-Length. Returns null if the body exceeds maxBytes
 * (the read is cancelled), bounding memory to ~maxBytes regardless of the header.
 */
async function readBodyCapped(
  req: Request,
  maxBytes: number,
): Promise<string | null> {
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      return null;
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "POST") {
    return json({ ok: false, error: "method not allowed" }, 405);
  }

  // Fail closed if the server is misconfigured.
  if (!SECRET || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error("webhook misconfigured: missing WEBHOOK_SECRET or Supabase env");
    return json({ ok: false, error: "server not configured" }, 500);
  }

  // Auth BEFORE reading the body.
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!provided || !(await secretMatches(provided))) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  // Stream the body with a true byte cap — do NOT trust Content-Length.
  let bodyText: string;
  try {
    const read = await readBodyCapped(req, MAX_BODY_BYTES);
    if (read === null) {
      return json({ ok: false, error: "payload too large" }, 413);
    }
    bodyText = read;
  } catch {
    return json({ ok: false, error: "could not read body" }, 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return json({ ok: false, error: "invalid JSON" }, 400);
  }

  let batch: ReturnType<typeof normalizeBatch>;
  try {
    batch = normalizeBatch(parsed);
  } catch (e) {
    return json(
      { ok: false, error: e instanceof Error ? e.message : "invalid payload" },
      400,
    );
  }

  // Reject absurdly large batches before fanning out to many sequential RPCs.
  if (batch.received > MAX_RECORDS) {
    return json({ ok: false, error: "too many records" }, 413);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let inserted = 0;
  let updated = 0;
  const dbErrors: { chunk: number; reason: string }[] = [];

  for (let i = 0; i < batch.records.length; i += CHUNK_SIZE) {
    const chunk: NormalizedRecord[] = batch.records.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase.rpc("upsert_villa_alumni", {
      p_records: chunk,
    });
    if (error) {
      // Full detail to the logs only; a generic reason in the response.
      console.error(`upsert chunk ${i / CHUNK_SIZE} failed:`, error.message);
      dbErrors.push({ chunk: i / CHUNK_SIZE, reason: "database error" });
      continue;
    }
    inserted += Number(data?.inserted ?? 0);
    updated += Number(data?.updated ?? 0);
  }

  const warning = dischargeDateWarning(batch.records);
  if (warning) console.warn(warning);

  // 200 with a per-record summary so Zapier does not retry-storm. NO PHI in the
  // response: only indices, reasons, and counts. inserted/updated are collapsed
  // into a single `processed` count so the response can't be used as a
  // salesforce_id existence oracle.
  return json({
    ok: dbErrors.length === 0,
    received: batch.received,
    processed: inserted + updated,
    skipped: batch.skipped.length,
    errors: batch.skipped,
    ...(dbErrors.length ? { dbErrors } : {}),
    ...(warning ? { warning } : {}),
  });
});
