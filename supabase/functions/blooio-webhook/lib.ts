/**
 * Pure, runtime-agnostic logic for the Blooio inbound webhook. No Deno, no
 * network, no crypto side effects — so it runs under Node/vitest and Deno alike.
 *
 * Responsibilities: parse the signature header, classify STOP/START keywords,
 * and normalize Blooio's (somewhat variable) event shapes into inbound-message
 * and delivery-status records.
 */

/** Standard carrier opt-out / opt-in keywords (matched on the trimmed message). */
export const STOP_KEYWORDS = new Set([
  "STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT-OUT", "REVOKE",
]);
export const START_KEYWORDS = new Set([
  "START", "UNSTOP", "YES", "OPTIN", "OPT-IN", "RESUME", "SUBSCRIBE",
]);

/** STOP/START classification of an inbound message body, or null. */
export function classifyKeyword(text: string | null | undefined): "stop" | "start" | null {
  if (!text) return null;
  // Normalize: trim, uppercase, collapse whitespace, strip surrounding punctuation.
  const norm = text.trim().toUpperCase().replace(/\s+/g, " ").replace(/[.!,;:]+$/g, "");
  if (norm === "") return null;
  if (STOP_KEYWORDS.has(norm)) return "stop";
  if (START_KEYWORDS.has(norm)) return "start";
  // Also treat a message whose FIRST token is a keyword (e.g. "STOP please") as such.
  const first = norm.split(" ")[0];
  if (STOP_KEYWORDS.has(first)) return "stop";
  if (START_KEYWORDS.has(first)) return "start";
  return null;
}

/** Parse `t=...,v1=...` from the X-Blooio-Signature header. */
export function parseSignatureHeader(
  header: string | null | undefined,
): { t: number; v1: string } | null {
  if (!header) return null;
  let t: number | null = null;
  let v1: string | null = null;
  for (const part of header.split(",")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === "t") t = Number(v);
    else if (k === "v1") v1 = v;
  }
  if (t === null || Number.isNaN(t) || !v1) return null;
  return { t, v1 };
}

const DELIVERY_STATUSES = new Set(["queued", "sent", "delivered", "read", "failed"]);

export interface InboundEvent {
  kind: "inbound";
  phone: string | null;
  text: string | null;
  providerMessageId: string | null;
}
export interface StatusEvent {
  kind: "status";
  providerMessageId: string | null;
  status: string;
}
export type ClassifiedEvent = InboundEvent | StatusEvent | { kind: "other" };

/** Unwrap a possible { type, data } envelope to the inner event object. */
function unwrap(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const obj = body as Record<string, unknown>;
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    return obj.data as Record<string, unknown>;
  }
  return obj;
}

/**
 * Classify a Blooio webhook payload. Tolerant of shape: inbound messages carry
 * `direction: "inbound"` (or a `text` with `status: "received"`); delivery events
 * carry a `status`/`kind` in the known delivery set.
 */
export function classifyEvent(body: unknown): ClassifiedEvent {
  const e = unwrap(body);
  const direction = typeof e.direction === "string" ? e.direction : "";
  const status = typeof e.status === "string" ? e.status : "";
  const kind = typeof e.kind === "string" ? e.kind : "";
  const text = typeof e.text === "string" ? e.text : null;
  const providerMessageId =
    (e.message_id as string) ?? (e.id as string) ?? null;

  const isInbound = direction === "inbound" || status === "received" || (text !== null && kind === "");
  if (isInbound) {
    return {
      kind: "inbound",
      phone: (e.sender as string) ?? (e.from as string) ?? null,
      text,
      providerMessageId: providerMessageId ? String(providerMessageId) : null,
    };
  }

  const effective = DELIVERY_STATUSES.has(status) ? status : DELIVERY_STATUSES.has(kind) ? kind : "";
  if (effective) {
    return { kind: "status", providerMessageId: providerMessageId ? String(providerMessageId) : null, status: effective };
  }
  return { kind: "other" };
}
