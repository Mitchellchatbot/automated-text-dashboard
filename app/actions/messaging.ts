"use server";

/**
 * Server Actions for the Blooio texting feature. These run only on the server
 * (the Blooio key never reaches the browser). All DB access uses the normal
 * authenticated server client, so RLS + is_staff() gate every read/write.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendBlooioText } from "@/lib/blooio";
import { renderTemplate, templateVars } from "@/lib/messaging/template";

const SEE_OFF = "see_off";

export interface SendResult {
  ok: boolean;
  /** sent | failed | opted_out | already_sent | auth */
  status: string;
  message: string;
}

export async function sendSeeOffAction(salesforceId: string): Promise<SendResult> {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const email = (claimsData?.claims as { email?: string } | undefined)?.email ?? null;
  if (!email) return { ok: false, status: "auth", message: "You're not signed in." };

  // Load the lead (RLS: allowlisted staff only).
  const { data: lead, error: leadErr } = await supabase
    .from("villa_alumni")
    .select("salesforce_id, full_name, phone_number, sms_opt_out")
    .eq("salesforce_id", salesforceId)
    .maybeSingle();
  if (leadErr) return { ok: false, status: "failed", message: leadErr.message };
  if (!lead) return { ok: false, status: "failed", message: "That record no longer exists." };
  if (lead.sms_opt_out) {
    return { ok: false, status: "opted_out", message: "This person has opted out of texts." };
  }

  // Already sent (any non-failed row)? Don't double-text.
  const { data: existing } = await supabase
    .from("message_log")
    .select("id, status")
    .eq("salesforce_id", salesforceId)
    .eq("template_key", SEE_OFF)
    .neq("status", "failed")
    .limit(1);
  if (existing && existing.length > 0) {
    return { ok: false, status: "already_sent", message: "A see-off text was already sent to this person." };
  }

  // Fill the template.
  const { data: tpl, error: tplErr } = await supabase
    .from("message_templates")
    .select("body")
    .eq("key", SEE_OFF)
    .maybeSingle();
  if (tplErr || !tpl) return { ok: false, status: "failed", message: "The see-off template is missing." };
  const text = renderTemplate(tpl.body, templateVars(lead));

  // Send via Blooio (idempotency key = one per person per template).
  const result = await sendBlooioText({
    phone: lead.phone_number,
    text,
    idempotencyKey: `${SEE_OFF}-${salesforceId}`,
  });

  // Record the attempt (success or failure) for audit + dedupe.
  const { error: logErr } = await supabase.from("message_log").insert({
    salesforce_id: salesforceId,
    template_key: SEE_OFF,
    phone_number: result.toE164 ?? lead.phone_number ?? "unknown",
    body_sent: text,
    provider_message_id: result.providerMessageId ?? null,
    status: result.ok ? "sent" : "failed",
    error: result.error ?? null,
    sent_by: email,
  });

  revalidatePath("/");
  revalidatePath("/alumni");

  if (result.ok) {
    return logErr
      ? { ok: true, status: "sent", message: `Text sent to ${result.toE164}, but recording it failed: ${logErr.message}` }
      : { ok: true, status: "sent", message: `See-off text sent to ${result.toE164}.` };
  }
  return { ok: false, status: "failed", message: result.error ?? "Send failed." };
}

export interface SeeOffStatus {
  status: string | null; // null = never attempted
  sentAt?: string;
  error?: string | null;
}

export async function getSeeOffStatusAction(salesforceId: string): Promise<SeeOffStatus> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("message_log")
    .select("status, created_at, error")
    .eq("salesforce_id", salesforceId)
    .eq("template_key", SEE_OFF)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0] as { status: string; created_at: string; error: string | null } | undefined;
  return row ? { status: row.status, sentAt: row.created_at, error: row.error } : { status: null };
}

export async function updateTemplateAction(body: string): Promise<{ ok: boolean; message: string }> {
  const trimmed = body.trim();
  if (trimmed === "") return { ok: false, message: "The message can't be empty." };
  if (trimmed.length > 1600) return { ok: false, message: "That's very long for a text (max 1600 chars)." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("message_templates")
    .update({ body: trimmed })
    .eq("key", SEE_OFF);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/settings");
  return { ok: true, message: "Template saved." };
}
