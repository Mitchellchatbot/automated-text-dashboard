import { statusTone } from "@/lib/statusTone";

export function StatusBadge({ status }: { status: string | null }) {
  const tone = statusTone(status);
  if (!tone || !status) return <span className="dash">—</span>;
  return <span className={`pill ${tone}`}>{status}</span>;
}
