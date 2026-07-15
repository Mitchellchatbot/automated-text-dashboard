/**
 * Timezone-safe display formatting for civil dates.
 *
 * The date is anchored at UTC midnight and formatted with `timeZone: 'UTC'`, so
 * a `'2026-07-14'` renders as "Jul 14, 2026" everywhere — never shifted a day by
 * the server's process zone or the viewer's browser zone.
 */

import { isValidCivilDate, BUSINESS_TZ } from "./timezone";

export const EMPTY_DATE_PLACEHOLDER = "—";

const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TZ,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Formats a civil date without any timezone shift. Returns "—" if invalid. */
export function formatCivilDate(value: string | null | undefined): string {
  if (!isValidCivilDate(value)) return EMPTY_DATE_PLACEHOLDER;
  return DISPLAY_FORMAT.format(new Date(`${value}T00:00:00Z`));
}

/** Human phrasing for a days-since count (handles null / future / today). */
export function formatDaysSince(days: number | null): string {
  if (days === null) return EMPTY_DATE_PLACEHOLDER;
  if (days < 0) return `in ${Math.abs(days)} day${days === -1 ? "" : "s"}`;
  if (days === 0) return "today";
  return `${days} day${days === 1 ? "" : "s"}`;
}

/**
 * Formats an ISO timestamp (e.g. created_at/updated_at) in the business
 * timezone (America/New_York) as "Jul 14, 2026, 6:52 PM". Returns "—" for
 * empty/invalid input. Unlike formatCivilDate, this expects a full timestamp.
 */
export function formatTimestamp(value: string | null | undefined): string {
  if (!value) return EMPTY_DATE_PLACEHOLDER;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return EMPTY_DATE_PLACEHOLDER;
  return TIMESTAMP_FORMAT.format(d);
}
