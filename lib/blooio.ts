/**
 * Server-side Blooio client. The API key lives ONLY in the server environment
 * (BLOOIO_API_KEY) — never NEXT_PUBLIC_, never shipped to the browser. Sending
 * happens from a Server Action, so this module is server-only.
 *
 * Send: POST {base}/v2/api/chats/{urlencoded E.164}/messages  body { text }
 * Auth: Authorization: Bearer <key>   Idempotency-Key: <stable per-recipient key>
 * Docs: https://docs.blooio.com/guides/message-sending
 */
import "server-only";
import { toE164 } from "@/lib/messaging/phone";

const BASE = process.env.BLOOIO_API_BASE ?? "https://api.blooio.com";

export interface BlooioSendResult {
  ok: boolean;
  status: "sent" | "failed";
  providerMessageId?: string;
  /** The E.164 number we actually sent to (for the audit log). */
  toE164?: string;
  error?: string;
}

export async function sendBlooioText(opts: {
  phone: string | null;
  text: string;
  idempotencyKey: string;
}): Promise<BlooioSendResult> {
  const key = process.env.BLOOIO_API_KEY;
  if (!key) {
    return { ok: false, status: "failed", error: "BLOOIO_API_KEY is not set on the server." };
  }
  const e164 = toE164(opts.phone);
  if (!e164) {
    return {
      ok: false,
      status: "failed",
      error: `Unusable phone number: ${opts.phone ?? "(none on file)"}`,
    };
  }

  const url = `${BASE}/v2/api/chats/${encodeURIComponent(e164)}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "Idempotency-Key": opts.idempotencyKey,
      },
      body: JSON.stringify({ text: opts.text }),
    });

    const bodyText = await res.text();
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : null;
    } catch {
      /* non-JSON body */
    }

    if (!res.ok) {
      const msg =
        (parsed?.message as string) ??
        (parsed?.error as string) ??
        (bodyText || `HTTP ${res.status}`);
      return { ok: false, status: "failed", error: String(msg), toE164: e164 };
    }

    const id =
      (parsed?.id as string) ??
      (parsed?.message_id as string) ??
      ((parsed?.data as Record<string, unknown> | undefined)?.id as string | undefined);
    return {
      ok: true,
      status: "sent",
      providerMessageId: id ? String(id) : undefined,
      toE164: e164,
    };
  } catch (e) {
    return {
      ok: false,
      status: "failed",
      error: e instanceof Error ? e.message : "network error",
      toE164: e164,
    };
  }
}
