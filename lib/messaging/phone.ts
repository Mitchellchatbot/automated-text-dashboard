/**
 * Best-effort E.164 normalization. Blooio requires E.164 (e.g. +15551234567).
 * Salesforce phone values are free-form ("+1 (555) 010-2030", "555-010-2030", …),
 * so we normalize and return null when we can't produce a plausible number —
 * the caller then refuses to send rather than texting a malformed number.
 */
export function toE164(
  raw: string | null | undefined,
  defaultCountry = "1",
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  if (hadPlus) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  if (digits.length === 10) return `+${defaultCountry}${digits}`; // US 10-digit
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}
