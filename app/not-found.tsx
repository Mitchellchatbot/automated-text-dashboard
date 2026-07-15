import Link from "next/link";

export default function NotFound() {
  return (
    <div className="auth-wrap">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <p className="eyebrow" style={{ marginBottom: 8 }}>404</p>
        <h1 style={{ marginBottom: 16 }}>Page not found</h1>
        <Link
          href="/"
          className="btn-primary"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", width: "auto", padding: "0 20px" }}
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
