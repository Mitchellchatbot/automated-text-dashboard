/**
 * Pure template rendering for outbound messages. No clock, no I/O.
 * Templates use {{placeholder}} tokens; unknown tokens render as empty string.
 */

/** First word of a name, used for {{first_name}}. */
export function firstName(full: string | null | undefined): string {
  return (full ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "";
}

export const SUPPORTED_PLACEHOLDERS = ["first_name", "full_name"] as const;

/** Build the per-recipient substitution map. */
export function templateVars(alum: { full_name: string | null }): Record<string, string> {
  const first = firstName(alum.full_name);
  return {
    first_name: first || "there", // friendly fallback so "Hi {{first_name}}" never reads "Hi ,"
    full_name: (alum.full_name ?? "").trim(),
  };
}

const PLACEHOLDER_RE = /\{\{\s*(\w+)\s*\}\}/g;

/** Replace every {{token}} in `body` from `vars` (missing → ""). */
export function renderTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(PLACEHOLDER_RE, (_m, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : "",
  );
}
