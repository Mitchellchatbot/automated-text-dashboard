"use client";

import { useEffect, useState, useTransition } from "react";
import {
  sendSeeOffAction,
  getSeeOffStatusAction,
  type SendResult,
} from "@/app/actions/messaging";

const SENT_STATES = new Set(["sent", "delivered", "read"]);

function label(status: string): string {
  switch (status) {
    case "sent": return "Sent";
    case "delivered": return "Delivered";
    case "read": return "Read";
    case "opted_out": return "Opted out";
    case "failed": return "Last attempt failed";
    default: return status;
  }
}

/**
 * See-off text control for the record modal. Shows the current send status and,
 * when nothing has been sent yet, a button to send it. Sending is a manual,
 * one-time-per-person action; the server refuses duplicates.
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
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getSeeOffStatusAction(salesforceId)
      .then((s) => {
        if (!alive) return;
        setStatus(s.status);
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
      if (res.ok) setStatus("sent");
      else if (res.status === "already_sent") setStatus("sent");
      else if (res.status === "opted_out") setStatus("opted_out");
    });

  const alreadySent = status !== null && SENT_STATES.has(status);
  const optedOut = status === "opted_out";
  const noPhone = !phoneNumber;

  return (
    <div className="seeoff">
      <div className="seeoff-head">
        <span className="seeoff-title">See-off text</span>
        {!loading && status && (
          <span className={`pill ${alreadySent ? "green" : optedOut ? "clay" : "neutral"}`}>
            {label(status)}
          </span>
        )}
      </div>

      {loading ? (
        <span className="dash">Checking…</span>
      ) : alreadySent ? (
        <p className="es" style={{ margin: 0 }}>
          A see-off text has been sent to this person.
        </p>
      ) : optedOut ? (
        <p className="es" style={{ margin: 0 }}>
          This person has opted out of texts — no messages will be sent.
        </p>
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
          {noPhone && (
            <p className="es" style={{ margin: "8px 0 0" }}>
              No phone number on file — can&rsquo;t send.
            </p>
          )}
        </>
      )}

      {note && (
        <p className="es" style={{ margin: "8px 0 0" }} role="status">
          {note}
        </p>
      )}
    </div>
  );
}
