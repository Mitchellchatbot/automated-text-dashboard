import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCivilDate, formatDaysSince } from "@/lib/followup";
import { initials } from "@/lib/initials";
import type { AlumniWithFollowUp } from "@/lib/types";

export function AllAlumniTable({ rows }: { rows: AlumniWithFollowUp[] }) {
  return (
    <div className="reclist">
      {rows.map((r) => (
        <div className="rec" key={r.id}>
          <div className="rec-mono" aria-hidden="true">{initials(r.full_name)}</div>
          <div className="rec-body">
            <div className="rec-top">
              <span className="rec-name">{r.full_name ?? "Unnamed"}</span>
              <span className="rec-sf mono">{r.salesforce_id}</span>
            </div>
            <div className="rec-sub">
              {r.discharge_date
                ? `Discharged ${formatCivilDate(r.discharge_date)} · ${formatDaysSince(r.daysSinceDischarge)} since discharge`
                : "No discharge date on file"}
            </div>
          </div>
          <div className="rec-status">
            <StatusBadge status={r.status} />
          </div>
        </div>
      ))}
    </div>
  );
}
