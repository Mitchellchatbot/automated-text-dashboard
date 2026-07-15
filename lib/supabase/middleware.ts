import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Public routes reachable without a session. */
const PUBLIC_PATHS = ["/login", "/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase auth session (single-use refresh tokens require this to
 * run in the proxy) and performs an optimistic auth redirect. Real data-access
 * authorization is enforced by RLS + is_staff() on the server.
 *
 * When `csp` is provided, the per-request nonce + Content-Security-Policy are
 * threaded onto the forwarded request headers (so Next applies the nonce to its
 * framework/inline scripts during SSR) and set on every response (so the browser
 * enforces the policy).
 */
export async function updateSession(
  request: NextRequest,
  csp?: { nonce: string; header: string },
) {
  const requestHeaders = new Headers(request.headers);
  if (csp) {
    requestHeaders.set("x-nonce", csp.nonce);
    requestHeaders.set("Content-Security-Policy", csp.header);
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Mark the session cookies Secure in production (localhost dev is http).
      cookieOptions: { secure: process.env.NODE_ENV === "production" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // Keep the forwarded request headers in sync with the rotated cookies
          // so the downstream render sees the refreshed session.
          requestHeaders.set(
            "cookie",
            request.cookies
              .getAll()
              .map((c) => `${c.name}=${c.value}`)
              .join("; "),
          );
          response = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: no logic between client creation and getClaims() — this call
  // refreshes the session and writes rotated cookies via setAll above.
  const { data } = await supabase.auth.getClaims();
  const authenticated = Boolean(data?.claims);

  const { pathname } = request.nextUrl;

  if (!authenticated && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    response = NextResponse.redirect(url);
  } else if (authenticated && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    response = NextResponse.redirect(url);
  }

  // Enforce the CSP on whatever response we return (next() or redirect).
  if (csp) response.headers.set("Content-Security-Policy", csp.header);
  return response;
}
