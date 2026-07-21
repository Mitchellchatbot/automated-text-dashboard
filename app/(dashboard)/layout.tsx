import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NavTabs } from "@/components/system/NavTabs";
import { ThemeToggle } from "@/components/system/ThemeToggle";
import { SignOutButton } from "@/components/system/SignOutButton";
import { AutoRefresh } from "@/components/system/Refreshers";
import { MotionInit } from "@/components/motion/MotionInit";
import { CursorGrid } from "@/components/background/CursorGrid";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims as { email?: string } | undefined;
  if (!claims) redirect("/login");
  const { data: isStaff } = await supabase.rpc("is_staff");

  return (
    <>
      <CursorGrid />
      <MotionInit />
      <AutoRefresh />
      <header className="topbar">
        <div className="topbar-in">
          <span className="brand">
            <span className="mark" aria-hidden="true">
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 17s-6-3.8-6-8a3.4 3.4 0 0 1 6-2 3.4 3.4 0 0 1 6 2c0 4.2-6 8-6 8z" />
              </svg>
            </span>
            Follow up Dashboard
          </span>
          <NavTabs />
          <div className="top-right">
            {claims.email && <span className="who">{claims.email}</span>}
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="page">
        {isStaff ? (
          children
        ) : (
          <div style={{ paddingTop: 32 }}>
            <EmptyState
              title="Access pending"
              description="Your account is signed in but not yet on the staff allowlist. Ask an administrator to add your email."
              icon="🔒"
            />
          </div>
        )}
      </main>
    </>
  );
}
