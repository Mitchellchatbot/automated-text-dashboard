"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { safeRedirect } from "@/lib/safeRedirect";

type Mode = "magic" | "password";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<Mode>("magic");
  const [status, setStatus] = useState<"idle" | "loading" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  function redirectTarget(): string {
    if (typeof window === "undefined") return "/";
    return safeRedirect(new URLSearchParams(window.location.search).get("redirect"));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("loading");
    const supabase = createClient();
    const target = redirectTarget();
    try {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(target);
        router.refresh();
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(target)}`,
        },
      });
      if (error) throw error;
      setStatus("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setStatus("idle");
    }
  }

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <span className="mark" aria-hidden="true" style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "var(--mark-bg)", color: "var(--mark-fg)" }}>
            <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 17s-6-3.8-6-8a3.4 3.4 0 0 1 6-2 3.4 3.4 0 0 1 6 2c0 4.2-6 8-6 8z" />
            </svg>
          </span>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em" }}>Follow up Dashboard</h1>
            <p className="lead" style={{ margin: 0, fontSize: 12.5 }}>Follow-up care · staff sign-in</p>
          </div>
        </div>

        {status === "sent" ? (
          <div role="status" className="notice ok">
            Check <strong>{email}</strong> for a sign-in link.
          </div>
        ) : (
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="field"
                placeholder="you@example.com"
              />
            </div>

            {mode === "password" && (
              <div>
                <label htmlFor="password" className="label">Password</label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="field"
                />
              </div>
            )}

            {error && (
              <div role="alert" className="notice err">{error}</div>
            )}

            <button type="submit" disabled={status === "loading"} className="btn-primary">
              {status === "loading" ? "Please wait…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
            </button>

            <button
              type="button"
              className="btn-link"
              onClick={() => {
                setMode(mode === "password" ? "magic" : "password");
                setError(null);
              }}
            >
              {mode === "password" ? "Use a magic link instead" : "Sign in with a password instead"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
