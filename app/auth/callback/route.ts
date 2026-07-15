import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRedirect } from "@/lib/safeRedirect";

/**
 * Returns a redirect with a *relative* `Location`, so the browser resolves it
 * against the real domain it is on. Behind Railway's proxy the Node route
 * handler sees an internal origin (`https://localhost:8080`), so building an
 * absolute URL from `request.nextUrl.origin` would 307 users to a dead host.
 * Relative Locations (like the proxy middleware already emits) sidestep that.
 */
function seeOther(location: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: location } });
}

/** Magic-link / OAuth code exchange landing route. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const target = safeRedirect(searchParams.get("redirect"));

  if (code) {
    const supabase = await createClient();
    // Sets the session cookies via the cookies() store in lib/supabase/server.ts;
    // Next attaches them to whatever response this handler returns.
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return seeOther(target);
    }
  }

  return seeOther("/login?error=auth");
}
