"use client";

import { useEffect, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { initials } from "@/lib/initials";
import { formatCivilDate, formatDaysSince, formatTimestamp } from "@/lib/followup";
import type { AlumniDetail } from "@/lib/types";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copybtn"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable (e.g. insecure context) — no-op */
        }
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/**
 * Centered, accessible record-detail dialog. Renders nothing when `alumni` is
 * null. All data comes from the already-loaded row — no fetch, no PHI in the URL.
 */
export function AlumniDetailModal({
  alumni,
  onClose,
}: {
  alumni: AlumniDetail | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!alumni) return;
    const prevActive = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!nodes || nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [alumni, onClose]);

  if (!alumni) return null;

  const name = alumni.full_name ?? "Unnamed";
  const titleId = "alumni-detail-title";

  return (
    <div className="modal-overlay">
      {/* Full-screen backdrop as a real button so click-outside-to-close passes a11y. */}
      <button
        type="button"
        className="modal-backdrop"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panelRef}
      >
        <button ref={closeRef} type="button" className="modal-close" aria-label="Close" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>

        <div className="detail-head">
          <div className="rec-mono" aria-hidden="true">{initials(alumni.full_name)}</div>
          <div className="detail-headtext">
            <h2 id={titleId} className="detail-name">{name}</h2>
            <div className="detail-sfrow">
              <span className="mono detail-sf">{alumni.salesforce_id}</span>
              <CopyButton value={alumni.salesforce_id} label="Salesforce ID" />
            </div>
          </div>
          <StatusBadge status={alumni.status} />
        </div>

        <dl className="detail-grid">
          <div className="detail-row">
            <dt>Phone</dt>
            <dd>
              {alumni.phone_number ? (
                <span className="detail-contact">
                  <a className="detail-action" href={`tel:${encodeURIComponent(alumni.phone_number)}`}>
                    {alumni.phone_number}
                  </a>
                  <CopyButton value={alumni.phone_number} label="phone number" />
                </span>
              ) : (
                <span className="dash">—</span>
              )}
            </dd>
          </div>

          <div className="detail-row">
            <dt>Email</dt>
            <dd>
              {alumni.email ? (
                <span className="detail-contact">
                  <a className="detail-action" href={`mailto:${encodeURIComponent(alumni.email)}`}>
                    {alumni.email}
                  </a>
                  <CopyButton value={alumni.email} label="email address" />
                </span>
              ) : (
                <span className="dash">—</span>
              )}
            </dd>
          </div>

          <div className="detail-row">
            <dt>Discharged</dt>
            <dd>
              {alumni.discharge_date ? (
                <>
                  {formatCivilDate(alumni.discharge_date)} · {formatDaysSince(alumni.daysSinceDischarge ?? null)} since discharge
                </>
              ) : (
                <span className="dash">No discharge date on file</span>
              )}
            </dd>
          </div>

          <div className="detail-row">
            <dt>Follow-up</dt>
            <dd>
              {alumni.group ? (
                <span className="chip">{alumni.group}</span>
              ) : (
                <span className="dash">Not on a milestone today</span>
              )}
            </dd>
          </div>

          <div className="detail-row">
            <dt>Added</dt>
            <dd>{formatTimestamp(alumni.created_at)}</dd>
          </div>

          <div className="detail-row">
            <dt>Last updated</dt>
            <dd>{formatTimestamp(alumni.updated_at)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
