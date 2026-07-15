/**
 * Pure construction of the discharge-date sets that drive the index-friendly
 * "due today" and "reached recently" queries — WITHOUT storing or hardcoding
 * anything.
 *
 * Because `daysSince == m`  <=>  `discharge_date == today - m`, the dashboard
 * computes the exact set of qualifying discharge dates in TypeScript and hands
 * a single `discharge_date IN (...)` query to the database.
 */

import {
  FIXED_MILESTONES,
  POST_90_INTERVAL,
  MAX_FOLLOWUP_AGE_DAYS,
} from "./schedule";
import { subDays, toEpochDay, type CivilDate } from "./timezone";

/**
 * Every discharge date that is "due today":
 *   - the fixed milestones: today-3, today-7, ..., today-90
 *   - the post-90 cadence:  today-120, today-150, ... bounded so we never emit
 *     a date older than `minDischarge` (keeps the "forever" tail finite).
 * De-duplicated.
 */
export function buildDueDateSet(
  today: CivilDate,
  minDischarge: CivilDate | null,
): CivilDate[] {
  const dates = new Set<CivilDate>();
  for (const m of FIXED_MILESTONES) dates.add(subDays(today, m));

  if (minDischarge) {
    // Never look back further than MAX_FOLLOWUP_AGE_DAYS, so one ancient/typo
    // discharge_date can't blow up the enumerated IN(...) list (→ 414 DoS).
    const minEpoch = Math.max(
      toEpochDay(minDischarge),
      toEpochDay(today) - MAX_FOLLOWUP_AGE_DAYS,
    );
    for (let days = 90 + POST_90_INTERVAL; ; days += POST_90_INTERVAL) {
      const discharge = subDays(today, days);
      if (toEpochDay(discharge) < minEpoch) break;
      dates.add(discharge);
    }
  }
  return [...dates];
}

/**
 * Every discharge date whose milestone fell on any day in the trailing window
 * `[today - toDaysAgo .. today - fromDaysAgo]` (inclusive). Used by the
 * stateless "reached in the last N days" catch-up list. De-duplicated.
 */
export function buildReachedWindowSet(
  today: CivilDate,
  fromDaysAgo: number,
  toDaysAgo: number,
  minDischarge: CivilDate | null,
): CivilDate[] {
  const dates = new Set<CivilDate>();
  for (let back = fromDaysAgo; back <= toDaysAgo; back++) {
    const day = subDays(today, back);
    for (const d of buildDueDateSet(day, minDischarge)) dates.add(d);
  }
  return [...dates];
}
