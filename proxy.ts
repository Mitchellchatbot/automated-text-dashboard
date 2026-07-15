import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { buildCsp } from "@/lib/security/csp";

// Next 16 renamed `middleware` -> `proxy` (root-level `proxy.ts`). This runs on
// every matched request to refresh the Supabase session, gate auth, and attach a
// per-request nonce-based Content-Security-Policy.
export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = { nonce, header: buildCsp(nonce) };
  return await updateSession(request, csp);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
