/**
 * Per-request Content-Security-Policy construction.
 *
 * Strict on scripts (nonce + 'strict-dynamic' — the real XSS defense, important
 * because the Supabase SSR session tokens are JS-readable), permissive on inline
 * styles (the UI relies on inline `style={{…}}` attributes). The nonce is minted
 * once per request in proxy.ts and threaded onto the forwarded request headers so
 * Next applies it to its framework/inline scripts.
 */

/** Origin of the Supabase project (for connect-src) — the browser client and
 * sign-out call it directly, so it must be allowed or auth breaks. */
function supabaseOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = supabaseOrigin();

  const directives = [
    `default-src 'self'`,
    // 'unsafe-eval' only in dev (React dev tooling); never in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used throughout the UI.
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' blob: data:`,
    `font-src 'self'`,
    // Supabase for auth/data; ws:/wss: in dev for HMR.
    `connect-src 'self'${supabase ? ` ${supabase}` : ""}${isDev ? " ws: wss:" : ""}`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join("; ");
}
