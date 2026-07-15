"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AlumniDetailModal } from "@/components/alumni/AlumniDetailModal";
import { formatCivilDate, formatDaysSince } from "@/lib/followup";
import { initials } from "@/lib/initials";
import { cardActivate } from "@/lib/cardActivate";
import type { AlumniWithFollowUp } from "@/lib/types";

export function AllAlumniTable({ rows }: { rows: AlumniWithFollowUp[] }) {
  const [selected, setSelected] = useState<AlumniWithFollowUp | null>(null);

  return (
    <>
      <div className="reclist">
        {rows.map((r) => (
          <div
            className="rec clickable"
            key={r.id}
            aria-label={`View details for ${r.full_name ?? "Unnamed"}`}
            {...cardActivate(() => setSelected(r))}
          >
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
      <AlumniDetailModal alumni={selected} onClose={() => setSelected(null)} />
    </>
  );
}
