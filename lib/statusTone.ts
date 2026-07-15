export type StatusTone = "green" | "blue" | "clay" | "neutral";

/** Maps a raw Salesforce Lead status to a soft display tone (display-only). */
export function statusTone(status: string | null | undefined): StatusTone | null {
  if (!status) return null;
  const s = status.toLowerCase();
  if (/(converted|won|complete|graduat)/.test(s)) return "blue";
  if (/(do.?not.?contact|opt.?out|unsubscrib|dnc)/.test(s)) return "clay";
  if (/(working|open|active|contacted|enrolled|current)/.test(s)) return "green";
  return "neutral";
}
