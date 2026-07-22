"use client";

import { useEffect, useState, useTransition } from "react";
import {
  sendSeeOffAction,
  getSeeOffStatusAction,
  setOptOutAction,
  type SendResult,
} from "@/app/actions/messaging";

const SENT_STATES = new Set(["sent", "delivered", "read"]);

function label(status: string): string {
  switch (status) {
    case "sent": return "Sent";
    case "delivered": return "Delivered";
    case "read": return "Read";
    case "failed": return "Last attempt failed";
    default: return status;
  }
}

/**
 * See-off text control for the record modal: shows send status + opt-out state,
 * a Send button when eligible, and a manual opt-out / reactivate toggle.
 * Sending is manual and one-time-per-person; the server refuses duplicates and
 * anything on the opt-out list.
 */
export function SeeOffControls({
  salesforceId,
  phoneNumber,
}: {
  salesforceId: string;
  phoneNumber: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [optedOut, setOptedOut] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const refresh = () =>
    getSeeOffStatusAction(salesforceId).then((s) => {
      setStatus(s.status);
      setOptedOut(s.optedOut);
      if (s.status === "failed" && s.error) setNote(s.error);
    });

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getSeeOffStatusAction(salesforceId)
      .then((s) => {
        if (!alive) return;
        setStatus(s.status);
        setOptedOut(s.optedOut);
        if (s.status === "failed" && s.error) setNote(s.error);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [salesforceId]);

  const send = () =>
    startTransition(async () => {
      setNote(null);
      const res: SendResult = await sendSeeOffAction(salesforceId);
      setNote(res.message);
      if (res.ok || res.status === "already_sent") setStatus("sent");
      if (res.status === "opted_out") setOptedOut(true);
    });

  const toggleOptOut = (next: boolean) =>
    startTransition(async () => {
      setNote(null);
      const res = await setOptOutAction(salesforceId, next);
      setNote(res.message);
      if (res.ok) {
        setOptedOut(next);
        await refresh();
      }
    });

  const alreadySent = status !== null && SENT_STATES.has(status);
  const noPhone = !phoneNumber;

  return (
    <div className="seeoff">
      <div className="seeoff-head">
        <span className="seeoff-title">See-off text</span>
        {!loading && (optedOut || (status && SENT_STATES.has(status))) && (
          <span className={`pill ${optedOut ? "clay" : "green"}`}>
            {optedOut ? "Opted out" : label(status as string)}
          </span>
        )}
      </div>

      {loading ? (
        <span className="dash">Checking…</span>
      ) : optedOut ? (
        <>
          <p className="es" style={{ margin: 0 }}>
            This number has opted out — no texts will be sent.
          </p>
          <button
            type="button"
            className="btn-link"
            style={{ alignSelf: "flex-start" }}
            disabled={pending}
            onClick={() => toggleOptOut(false)}
          >
            {pending ? "Working…" : "Reactivate texting"}
          </button>
        </>
      ) : alreadySent ? (
        <>
          <p className="es" style={{ margin: 0 }}>A see-off text has been sent to this person.</p>
          <button type="button" className="btn-link" style={{ alignSelf: "flex-start" }} disabled={pending} onClick={() => toggleOptOut(true)}>
            Mark opted out
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="btn-primary"
            style={{ maxWidth: 220 }}
            disabled={pending || noPhone}
            onClick={send}
          >
            {pending ? "Sending…" : status === "failed" ? "Retry see-off text" : "Send see-off text"}
          </button>
          {noPhone && <p className="es" style={{ margin: "8px 0 0" }}>No phone number on file — can&rsquo;t send.</p>}
          {!noPhone && (
            <button type="button" className="btn-link" style={{ alignSelf: "flex-start" }} disabled={pending} onClick={() => toggleOptOut(true)}>
              Mark opted out
            </button>
          )}
        </>
      )}

      {note && (
        <p className="es" style={{ margin: "8px 0 0" }} role="status">{note}</p>
      )}
    </div>
  );
}
