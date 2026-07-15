/**
 * Returns `v` only when it is a safe same-origin relative path. Rejects
 * protocol-relative (`//evil.com`) and backslash (`/\evil.com`) targets — both
 * start with "/" but browsers resolve them to a foreign origin — falling back to
 * "/". Used for every post-auth redirect so a crafted `?redirect=` can't bounce a
 * signed-in staff member off-site.
 */
export function safeRedirect(v: string | null | undefined): string {
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\")) {
    return "/";
  }
  return v;
}
