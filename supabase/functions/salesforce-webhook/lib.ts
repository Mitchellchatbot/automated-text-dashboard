/**
 * Pure, runtime-agnostic webhook logic. Imports NOTHING from Deno or supabase-js
 * so it can be unit-tested under Node/vitest AND imported by the Deno function.
 *
 * Responsibilities: parse tolerant payload shapes, map Salesforce field names,
 * normalize + validate values, and dedupe a batch. It never touches the network.
 */

export interface NormalizedRecord {
  salesforce_id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  /** 'YYYY-MM-DD' or null (never timezone-shifted). */
  discharge_date: string | null;
  /** Raw Salesforce Lead Status, verbatim; null when absent. */
  status: string | null;
}

export interface SkippedRecord {
  index: number;
  reason: string;
}

export interface NormalizeResult {
  received: number;
  records: NormalizedRecord[];
  skipped: SkippedRecord[];
}

/** Candidate source keys (matched case-insensitively), most-specific first. */
const FIELD_CANDIDATES = {
  salesforce_id: ["salesforce_id", "id", "sfid", "salesforceid", "sf_id"],
  full_name: ["full_name", "name", "fullname", "client_name", "clientname"],
  email: ["email", "email_address", "emailaddress"],
  phone_number: ["phone_number", "phone", "phonenumber", "mobilephone", "mobile"],
  discharge_date: [
    "discharged_date__c",
    "discharge_date",
    "dischargedate",
    "discharged_on",
    "discharge",
  ],
  status: ["status", "client_status", "stage"],
  discharge_flag: ["discharged_treatment__c", "discharged_treatment"],
} as const;

const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Plausible discharge-year window. Rejecting out-of-range years at ingest keeps
// a typo'd/ancient value (e.g. 1900-01-01) out of the data. Pure (no clock) so
// the parser stays deterministic; the DB CHECK in migration 0003 mirrors this.
const MIN_DISCHARGE_YEAR = 2000;
const MAX_DISCHARGE_YEAR = 2100;

function isValidCivilDate(s: string): boolean {
  if (!CIVIL_DATE_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Robust discharge-date parse. Takes the leading calendar-date portion and
 * NEVER timezone-converts. This is what prevents the -1-day bug when Salesforce
 * serializes a Date as midnight-UTC ('2026-07-14T00:00:00.000Z' -> '2026-07-14').
 */
export function parseDischargeDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (s === "") return null;
  const candidate = s.slice(0, 10);
  if (!isValidCivilDate(candidate)) return null;
  const year = Number(candidate.slice(0, 4));
  if (year < MIN_DISCHARGE_YEAR || year > MAX_DISCHARGE_YEAR) return null;
  return candidate;
}

/**
 * Store the Salesforce Lead Status verbatim (trimmed). Every discharged record
 * is eligible for follow-ups regardless of Status, so we keep the raw value for
 * display/filtering rather than mapping it to a fixed vocabulary. Null when absent.
 */
export function cleanStatus(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s === "" ? null : s;
}

/**
 * Interprets the Discharged_Treatment__c flag. Returns false ONLY when the value
 * is explicitly falsey (boolean false / "false" / "0" / "no"); absent or true
 * yields true, so a missing mapping never drops every record.
 */
export function isDischarged(value: unknown): boolean {
  if (value === false) return false;
  if (typeof value === "string") {
    const s = value.trim().toLowerCase();
    if (s === "false" || s === "0" || s === "no") return false;
  }
  return true;
}

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") {
    if (typeof value === "number") return String(value);
    return null;
  }
  const s = value.trim();
  return s === "" ? null : s;
}

/** Case-insensitive lookup across candidate keys. */
function pick(
  lowered: Record<string, unknown>,
  candidates: readonly string[],
): unknown {
  for (const key of candidates) {
    const v = lowered[key];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function lowerKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase();
    if (UNSAFE_KEYS.has(lk)) continue; // prototype-pollution hygiene
    out[lk] = v;
  }
  return out;
}

/**
 * Extract the record array from tolerant payload shapes:
 *   - a bare array
 *   - { records: [...] } (our contract AND the raw Salesforce SOQL response body)
 *   - { data: [...] }
 *   - the Zapier "Full Response Data" wrapper from a Custom/API Request step:
 *       { request, response: { status, headers, body }, data: { records: [...] } }
 *     — records are dug out of the parsed `data`, or by re-parsing `response.body`.
 *   - a single record object
 * Throws for anything else (malformed body).
 */
export function extractRecords(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    if (Array.isArray(obj.records)) return obj.records as Record<string, unknown>[];
    if (Array.isArray(obj.data)) return obj.data as Record<string, unknown>[];

    // Zapier "Full Response Data" wrapper: the parsed response sits under `data`.
    if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
      const inner = obj.data as Record<string, unknown>;
      if (Array.isArray(inner.records)) return inner.records as Record<string, unknown>[];
      if (Array.isArray(inner.data)) return inner.data as Record<string, unknown>[];
    }
    // …or re-parse the raw HTTP response body string the wrapper carries.
    if (obj.response && typeof obj.response === "object") {
      const resp = obj.response as Record<string, unknown>;
      if (typeof resp.body === "string") {
        try {
          return extractRecords(JSON.parse(resp.body));
        } catch {
          // not JSON — fall through to the error below
        }
      }
    }

    // A single record object (has at least one recognizable id key).
    const lowered = lowerKeys(obj);
    if (pick(lowered, FIELD_CANDIDATES.salesforce_id) !== undefined) return [obj];
  }
  throw new Error(
    "Unrecognized payload shape: expected an array, { records: [...] }, or a record object.",
  );
}

/** Map one raw record to a NormalizedRecord, or a reason string if invalid. */
export function mapRecord(
  raw: unknown,
): NormalizedRecord | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "not an object" };
  const lowered = lowerKeys(raw as Record<string, unknown>);

  const salesforce_id = cleanString(pick(lowered, FIELD_CANDIDATES.salesforce_id));
  if (!salesforce_id) return { error: "missing salesforce_id" };

  // Defensive: the SOQL already filters Discharged_Treatment__c = true, but drop
  // any record explicitly flagged as not discharged.
  if (!isDischarged(pick(lowered, FIELD_CANDIDATES.discharge_flag))) {
    return { error: "not discharged" };
  }

  return {
    salesforce_id,
    full_name: cleanString(pick(lowered, FIELD_CANDIDATES.full_name)),
    email: cleanString(pick(lowered, FIELD_CANDIDATES.email)),
    phone_number: cleanString(pick(lowered, FIELD_CANDIDATES.phone_number)),
    discharge_date: parseDischargeDate(pick(lowered, FIELD_CANDIDATES.discharge_date)),
    status: cleanStatus(pick(lowered, FIELD_CANDIDATES.status)),
  };
}

/** Dedupe by salesforce_id, last occurrence wins (matches Salesforce ordering). */
export function dedupeBySalesforceId(
  records: NormalizedRecord[],
): NormalizedRecord[] {
  const byId = new Map<string, NormalizedRecord>();
  for (const r of records) byId.set(r.salesforce_id, r);
  return [...byId.values()];
}

/** Full normalization pipeline for a request body. */
export function normalizeBatch(body: unknown): NormalizeResult {
  const raw = extractRecords(body);
  const valid: NormalizedRecord[] = [];
  const skipped: SkippedRecord[] = [];

  raw.forEach((rec, index) => {
    const mapped = mapRecord(rec);
    if ("error" in mapped) skipped.push({ index, reason: mapped.error });
    else valid.push(mapped);
  });

  return {
    received: raw.length,
    records: dedupeBySalesforceId(valid),
    skipped,
  };
}

/**
 * Misconfiguration guard: a non-empty batch where NOT ONE record carried a
 * usable discharge_date almost certainly means the wrong Salesforce field was
 * mapped in Zapier — otherwise the system silently ingests rows that can never
 * become "due". Returns a warning string, or null.
 */
export function dischargeDateWarning(
  records: NormalizedRecord[],
): string | null {
  if (records.length === 0) return null;
  const withDate = records.filter((r) => r.discharge_date !== null).length;
  if (withDate === 0) {
    return `All ${records.length} records have no valid discharge_date. Check the discharge-date field mapping in the Zap.`;
  }
  return null;
}
