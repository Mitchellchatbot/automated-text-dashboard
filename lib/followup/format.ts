/**
 * Timezone-safe display formatting for civil dates.
 *
 * The date is anchored at UTC midnight and formatted with `timeZone: 'UTC'`, so
 * a `'2026-07-14'` renders as "Jul 14, 2026" everywhere — never shifted a day by
 * the server's process zone or the viewer's browser zone.
 */

import { isValidCivilDate } from "./timezone";

export const EMPTY_DATE_PLACEHOLDER = "—";

const DISPLAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
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
