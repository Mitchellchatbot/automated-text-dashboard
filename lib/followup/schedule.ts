/**
 * The follow-up schedule — the single source of truth for "which milestone,
 * and is a client due". Pure functions; no clock, no I/O.
 *
 * Milestones: Day 3, 7, 14, 21, 30, 45, 60, 75, 90. After Day 90, every 30 days
 * forever (Day 120, 150, 180, ...). A client is "due" only on the exact day
 * their days-since-discharge equals a milestone.
 */

import { isValidCivilDate, toEpochDay, type CivilDate } from "./timezone";

export const FIXED_MILESTONES = [3, 7, 14, 21, 30, 45, 60, 75, 90] as const;
export type FixedMilestone = (typeof FIXED_MILESTONES)[number];

export const POST_90_INTERVAL = 30;
export const POST_90_LABEL = "Post 90" as const;

/**
 * Upper bound on the post-90 "every 30 days forever" tail, in days (~5 years).
 * The due-date sets are materialized as an explicit `discharge_date IN (...)`
 * list; without a cap, a single very old (or typo'd) discharge_date would make
 * that list — and the resulting GET URL — grow without bound and 414, breaking
 * the dashboard for everyone. Clamping the look-back keeps the URL small while
 * still covering any realistic recent discharge.
 */
export const MAX_FOLLOWUP_AGE_DAYS = 365 * 5;

export type FollowUpGroup = `Day ${FixedMilestone}` | typeof POST_90_LABEL;

const FIXED_SET: ReadonlySet<number> = new Set<number>(FIXED_MILESTONES);

/** Render order for the "Follow Ups Due Today" panel. */
export const ALL_GROUPS: readonly FollowUpGroup[] = [
  ...FIXED_MILESTONES.map((m): FollowUpGroup => `Day ${m}`),
  POST_90_LABEL,
];

/**
 * Whole calendar days between `discharge` and `today` (both civil dates in the
 * business timezone). Returns null for missing/invalid discharge dates.
 *
 * DST-proof and time-of-day-proof: it is a difference of two UTC-anchored
 * epoch-days, never `(Date.now() - ms) / 86_400_000`.
 */
export function daysSinceDischarge(
  discharge: string | null | undefined,
  today: CivilDate,
): number | null {
  if (!isValidCivilDate(discharge)) return null;
  return toEpochDay(today) - toEpochDay(discharge);
}

/** True for the post-90 cadence: 120, 150, 180, ... (strictly greater than 90). */
export function isPostNinety(days: number): boolean {
  return days > 90 && (days - 90) % POST_90_INTERVAL === 0;
}

/** Whether a client with this days-since value is due for follow-up today. */
export function isDueToday(days: number | null): boolean {
  if (days === null) return false;
  return FIXED_SET.has(days) || isPostNinety(days);
}

/** Which follow-up group a days-since value belongs to, or null if none. */
export function groupFor(days: number | null): FollowUpGroup | null {
  if (days === null) return null;
  if (FIXED_SET.has(days)) return `Day ${days as FixedMilestone}`;
  if (isPostNinety(days)) return POST_90_LABEL;
  return null;
}

/**
 * The most recent milestone a client reached within the trailing window
 * `[fromDaysAgo .. toDaysAgo]` (inclusive), or null. `daysAgo === 0` means the
 * milestone falls today. Used by the stateless "reached recently" catch-up list;
 * returning the smallest `daysAgo` yields the most recent milestone.
 */
export function milestoneReachedWithin(
  days: number | null,
  fromDaysAgo: number,
  toDaysAgo: number,
): { milestone: number; group: FollowUpGroup; daysAgo: number } | null {
  if (days === null) return null;
  for (let daysAgo = fromDaysAgo; daysAgo <= toDaysAgo; daysAgo++) {
    const atThatDay = days - daysAgo;
    if (atThatDay < 0) break;
    const group = groupFor(atThatDay);
    if (group) return { milestone: atThatDay, group, daysAgo };
  }
  return null;
}
