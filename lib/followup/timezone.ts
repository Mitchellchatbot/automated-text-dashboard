/**
 * Timezone-safe civil-date primitives.
 *
 * A `CivilDate` is a calendar day (`'YYYY-MM-DD'`) with no time and no zone.
 * `discharge_date` is a Postgres `DATE`, which PostgREST returns as exactly this
 * string, so we never wrap it in `new Date()` — that single rule kills a whole
 * class of timezone/DST bugs.
 *
 * The ONLY place the wall clock + IANA timezone database are consulted is
 * `getTodayNY()`. Every other function is pure and deterministic.
 */

export const BUSINESS_TZ = "America/New_York" as const;

/** Invariant: matches /^\d{4}-\d{2}-\d{2}$/ AND is a real calendar date. */
export type CivilDate = string;

const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * Today's civil date in the business timezone (America/New_York).
 * This is the single impurity in the engine.
 */
export function getTodayNY(now: Date = new Date()): CivilDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Proleptic Gregorian day number, anchored at UTC midnight. Because every UTC
 * day is exactly 86_400_000 ms, offsets/DST never enter — the difference of two
 * epoch-days is an exact integer number of calendar days.
 */
export function toEpochDay(date: CivilDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.trunc(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function fromEpochDay(epochDay: number): CivilDate {
  const dt = new Date(epochDay * 86_400_000);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(
    dt.getUTCDate(),
  )}`;
}

export function subDays(date: CivilDate, n: number): CivilDate {
  return fromEpochDay(toEpochDay(date) - n);
}

export function addDays(date: CivilDate, n: number): CivilDate {
  return fromEpochDay(toEpochDay(date) + n);
}

/**
 * Validates shape AND that it is a real calendar date. The round-trip catches
 * overflow-normalized inputs (e.g. `2026-02-30` -> `2026-03-02` != input) and
 * 2-digit-year foot-guns (`0026` -> parsed as 1926 by Date.UTC).
 */
export function isValidCivilDate(value: unknown): value is CivilDate {
  if (typeof value !== "string" || !CIVIL_DATE_RE.test(value)) return false;
  return fromEpochDay(toEpochDay(value)) === value;
}
