"use client";

export default function DashboardError(props: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  const retry =
    props.unstable_retry ??
    props.reset ??
    (() => {
      if (typeof window !== "undefined") window.location.reload();
    });

  return (
    <div style={{ display: "grid", placeItems: "center", padding: "72px 24px" }}>
      <div className="soft-card" style={{ padding: 0, maxWidth: 420, width: "100%" }}>
        <div className="empty">
          <div className="halo" aria-hidden="true">⚠️</div>
          <p className="et">Something went wrong</p>
          <p className="es">The dashboard couldn’t load its data. This is usually temporary — try again.</p>
          <button className="btn-primary" style={{ maxWidth: 200, marginTop: 10 }} onClick={retry} type="button">
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}
