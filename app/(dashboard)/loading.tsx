import { Skeleton } from "@/components/ui/Skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton style={{ height: 12, width: 200, marginBottom: 22 }} />
      <div className="hero-grid">
        <Skeleton style={{ height: 190, borderRadius: 22 }} />
        <div className="stat-mini-col">
          <Skeleton style={{ height: 87, borderRadius: 18 }} />
          <Skeleton style={{ height: 87, borderRadius: 18 }} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 11, margin: "22px 0 20px" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} style={{ height: 38, width: 100, borderRadius: 13, flex: "none" }} />
        ))}
      </div>
      <div className="milestones">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} style={{ height: 74, borderRadius: 18 }} />
        ))}
      </div>
    </div>
  );
}
