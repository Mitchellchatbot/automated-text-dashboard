"use client";

import { useState, useTransition } from "react";
import { updateTemplateAction } from "@/app/actions/messaging";
import { SUPPORTED_PLACEHOLDERS, renderTemplate, templateVars } from "@/lib/messaging/template";

/** Editor for the see-off template, with a live preview and save. */
export function TemplateEditor({ initialBody }: { initialBody: string }) {
  const [body, setBody] = useState(initialBody);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = renderTemplate(body, templateVars({ full_name: "Jordan Rivera" }));
  const dirty = body.trim() !== initialBody.trim();

  const save = () =>
    startTransition(async () => {
      setNote(null);
      const res = await updateTemplateAction(body);
      setNote(res.message);
    });

  return (
    <div className="soft-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label htmlFor="tpl" className="label">Message</label>
        <textarea
          id="tpl"
          className="field"
          style={{ minHeight: 120, resize: "vertical", lineHeight: 1.5 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <p className="es" style={{ margin: "8px 0 0" }}>
          Placeholders:{" "}
          {SUPPORTED_PLACEHOLDERS.map((p) => (
            <code key={p} className="mono" style={{ marginRight: 8 }}>{`{{${p}}}`}</code>
          ))}
          — keep a “Reply STOP to opt out” line for compliance.
        </p>
      </div>

      <div>
        <span className="label">Preview (example: Jordan Rivera)</span>
        <div className="soft-card" style={{ background: "var(--surface-2)", margin: 0 }}>
          {preview || <span className="dash">—</span>}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button type="button" className="btn-primary" style={{ maxWidth: 160 }} disabled={pending || !dirty} onClick={save}>
          {pending ? "Saving…" : "Save template"}
        </button>
        {note && <span className="es" role="status">{note}</span>}
      </div>
    </div>
  );
}
