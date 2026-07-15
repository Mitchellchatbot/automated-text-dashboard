import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (uses the publishable/anon key + RLS). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Mark the session cookies Secure in production (localhost dev is http).
      cookieOptions: { secure: process.env.NODE_ENV === "production" },
    },
  );
}
