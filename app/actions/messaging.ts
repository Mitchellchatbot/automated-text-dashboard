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
import { toE164 } from "@/lib/messaging/phone";

const SEE_OFF = "see_off";

/** True if this E.164 number is on the opt-out list. */
async function isSuppressed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  e164: string | null,
): Promise<boolean> {
  if (!e164) return false;
  const { data } = await supabase
    .from("message_suppressions")
    .select("opted_out")
    .eq("phone_number", e164)
    .maybeSingle();
  return Boolean(data?.opted_out);
}

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

  // Phone-keyed opt-out is the authoritative TCPA check (a number can outlive a lead).
  const e164 = toE164(lead.phone_number);
  if (await isSuppressed(supabase, e164)) {
    return { ok: false, status: "opted_out", message: "This number has opted out (replied STOP)." };
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
  optedOut: boolean;
}

export async function getSeeOffStatusAction(salesforceId: string): Promise<SeeOffStatus> {
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("villa_alumni")
    .select("phone_number, sms_opt_out")
    .eq("salesforce_id", salesforceId)
    .maybeSingle();
  const optedOut =
    Boolean(lead?.sms_opt_out) || (await isSuppressed(supabase, toE164(lead?.phone_number ?? null)));

  const { data } = await supabase
    .from("message_log")
    .select("status, created_at, error")
    .eq("salesforce_id", salesforceId)
    .eq("template_key", SEE_OFF)
    .order("created_at", { ascending: false })
    .limit(1);
  const row = data?.[0] as { status: string; created_at: string; error: string | null } | undefined;
  return row
    ? { status: row.status, sentAt: row.created_at, error: row.error, optedOut }
    : { status: null, optedOut };
}

/** Manual opt-out / reactivate for a lead's phone (verbal STOP, staff correction). */
export async function setOptOutAction(
  salesforceId: string,
  optOut: boolean,
): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();

  const { data: lead, error } = await supabase
    .from("villa_alumni")
    .select("phone_number")
    .eq("salesforce_id", salesforceId)
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  const e164 = toE164(lead?.phone_number ?? null);
  if (!e164) return { ok: false, message: "No usable phone number on file for this person." };

  const { error: upErr } = await supabase.from("message_suppressions").upsert(
    {
      phone_number: e164,
      opted_out: optOut,
      reason: "manual",
      source: "manual",
    },
    { onConflict: "phone_number" },
  );
  if (upErr) return { ok: false, message: upErr.message };

  // Mirror onto the lead flag for at-a-glance visibility (phone list stays authoritative).
  await supabase.from("villa_alumni").update({ sms_opt_out: optOut }).eq("salesforce_id", salesforceId);

  revalidatePath("/");
  revalidatePath("/alumni");
  return {
    ok: true,
    message: optOut ? "Marked opted out — no texts will be sent." : "Reactivated — texts allowed again.",
  };
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
