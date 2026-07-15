import { describe, it, expect } from "vitest";
import { differenceInCalendarDays } from "date-fns";
import { TZDate } from "@date-fns/tz";
import {
  getTodayNY,
  toEpochDay,
  fromEpochDay,
  subDays,
  addDays,
  isValidCivilDate,
} from "@/lib/followup/timezone";
import {
  FIXED_MILESTONES,
  ALL_GROUPS,
  MAX_FOLLOWUP_AGE_DAYS,
  daysSinceDischarge,
  isDueToday,
  isPostNinety,
  groupFor,
  milestoneReachedWithin,
} from "@/lib/followup/schedule";
import {
  buildDueDateSet,
  buildReachedWindowSet,
} from "@/lib/followup/dueQuery";
import { formatCivilDate, formatDaysSince } from "@/lib/followup/format";

describe("getTodayNY (the single clock read)", () => {
  it("resolves the NY civil date, not the UTC date, late in the evening (EDT)", () => {
    // 2026-07-15 02:00 UTC === 2026-07-14 22:00 America/New_York (EDT, -4)
    expect(getTodayNY(new Date("2026-07-15T02:00:00Z"))).toBe("2026-07-14");
  });
  it("resolves correctly in winter (EST, -5)", () => {
    // 2026-01-15 04:30 UTC === 2026-01-14 23:30 America/New_York (EST, -5)
    expect(getTodayNY(new Date("2026-01-15T04:30:00Z"))).toBe("2026-01-14");
  });
  it("resolves midday UTC to the same NY day", () => {
    expect(getTodayNY(new Date("2026-07-14T12:00:00Z"))).toBe("2026-07-14");
  });
});

describe("epoch-day helpers", () => {
  it("round-trips civil dates", () => {
    for (const d of ["2026-07-14", "2000-02-29", "2024-02-29", "1999-12-31"]) {
      expect(fromEpochDay(toEpochDay(d))).toBe(d);
    }
  });
  it("subDays / addDays cross month & year boundaries", () => {
    expect(subDays("2026-03-01", 1)).toBe("2026-02-28"); // 2026 not leap
    expect(subDays("2024-03-01", 1)).toBe("2024-02-29"); // 2024 leap
    expect(subDays("2026-01-01", 1)).toBe("2025-12-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("isValidCivilDate", () => {
  it("accepts real calendar dates", () => {
    expect(isValidCivilDate("2026-07-14")).toBe(true);
    expect(isValidCivilDate("2024-02-29")).toBe(true);
  });
  it("rejects wrong shapes and impossible/edge dates", () => {
    expect(isValidCivilDate("2026-2-4")).toBe(false);
    expect(isValidCivilDate("2026-02-30")).toBe(false); // Feb 30
    expect(isValidCivilDate("2026-13-01")).toBe(false); // month 13
    expect(isValidCivilDate("2025-02-29")).toBe(false); // not a leap year
    expect(isValidCivilDate("0026-01-01")).toBe(false); // 2-digit-year foot-gun
    expect(isValidCivilDate(null)).toBe(false);
    expect(isValidCivilDate(undefined)).toBe(false);
    expect(isValidCivilDate(20260714)).toBe(false);
    expect(isValidCivilDate("2026-07-14T00:00:00Z")).toBe(false);
  });
});

describe("daysSinceDischarge (DST/leap-year proof)", () => {
  it("is exactly 30 across the NY spring-forward (2026-03-08)", () => {
    // A naive ms/86_400_000 would compute 29.958 -> floor 29 and hide the client.
    expect(daysSinceDischarge("2026-02-06", "2026-03-08")).toBe(30);
  });
  it("is exactly 30 across the NY fall-back (2026-11-01)", () => {
    expect(daysSinceDischarge("2026-10-02", "2026-11-01")).toBe(30);
  });
  it("handles leap vs non-leap February", () => {
    expect(daysSinceDischarge("2024-02-28", "2024-03-01")).toBe(2); // leap
    expect(daysSinceDischarge("2023-02-28", "2023-03-01")).toBe(1); // non-leap
  });
  it("is 0 on the discharge day and negative in the future", () => {
    expect(daysSinceDischarge("2026-07-14", "2026-07-14")).toBe(0);
    expect(daysSinceDischarge("2026-07-20", "2026-07-14")).toBe(-6);
  });
  it("returns null for missing / invalid discharge", () => {
    expect(daysSinceDischarge(null, "2026-07-14")).toBeNull();
    expect(daysSinceDischarge("", "2026-07-14")).toBeNull();
    expect(daysSinceDischarge("nonsense", "2026-07-14")).toBeNull();
    expect(daysSinceDischarge("2026-02-30", "2026-07-14")).toBeNull();
  });

  it("matches date-fns differenceInCalendarDays over many pairs", () => {
    // Deterministic pseudo-random pairs 1990-2060, incl. DST/leap spans.
    let seed = 123456789;
    const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 500; i++) {
      const disc = fromEpochDay(Math.trunc(rand() * 25000) + 7305); // ~1990..2058
      const today = fromEpochDay(Math.trunc(rand() * 25000) + 7305);
      const ours = daysSinceDischarge(disc, today);
      const ref = differenceInCalendarDays(
        new TZDate(`${today}T00:00:00`, "UTC"),
        new TZDate(`${disc}T00:00:00`, "UTC"),
      );
      expect(ours).toBe(ref);
    }
  });
});

describe("isDueToday / isPostNinety / groupFor", () => {
  it("is due on every fixed milestone", () => {
    for (const m of FIXED_MILESTONES) expect(isDueToday(m)).toBe(true);
  });
  it("is not due on non-milestone days", () => {
    for (const d of [0, 1, 2, 4, 5, 6, 29, 31, 44, 91, 100, 105, 119]) {
      expect(isDueToday(d)).toBe(false);
    }
  });
  it("follows the post-90 cadence (120, 150, 180, ...) and not 105/90-dupes", () => {
    expect(isPostNinety(90)).toBe(false); // owned by the fixed list, strict > 90
    expect(isPostNinety(120)).toBe(true);
    expect(isPostNinety(150)).toBe(true);
    expect(isPostNinety(180)).toBe(true);
    expect(isPostNinety(105)).toBe(false);
    expect(isPostNinety(300)).toBe(true);
  });
  it("returns null for null / future days", () => {
    expect(isDueToday(null)).toBe(false);
    expect(isDueToday(-3)).toBe(false);
    expect(groupFor(null)).toBeNull();
  });
  it("maps days to the correct group", () => {
    expect(groupFor(3)).toBe("Day 3");
    expect(groupFor(90)).toBe("Day 90");
    expect(groupFor(120)).toBe("Post 90");
    expect(groupFor(91)).toBeNull();
  });
  it("exposes 10 groups in render order ending with Post 90", () => {
    expect(ALL_GROUPS).toHaveLength(10);
    expect(ALL_GROUPS[0]).toBe("Day 3");
    expect(ALL_GROUPS[9]).toBe("Post 90");
  });
});

describe("milestoneReachedWithin (catch-up)", () => {
  it("finds the most recent past milestone in the window", () => {
    // 32 days since discharge -> Day 30 was reached 2 days ago.
    expect(milestoneReachedWithin(32, 1, 7)).toEqual({
      milestone: 30,
      group: "Day 30",
      daysAgo: 2,
    });
  });
  it("excludes today's milestone when window starts at 1", () => {
    // Exactly on Day 3 today -> nothing in [1..7].
    expect(milestoneReachedWithin(3, 1, 7)).toBeNull();
  });
  it("returns the nearest when two milestones fall in the window", () => {
    // 8 days: Day 7 was 1 day ago, Day 3 was 5 days ago -> nearest = Day 7.
    expect(milestoneReachedWithin(8, 1, 7)).toEqual({
      milestone: 7,
      group: "Day 7",
      daysAgo: 1,
    });
  });
  it("returns null when nothing was reached recently", () => {
    expect(milestoneReachedWithin(40, 1, 7)).toBeNull();
    expect(milestoneReachedWithin(null, 1, 7)).toBeNull();
  });
});

describe("buildDueDateSet", () => {
  const today = "2026-07-14";
  it("emits exactly the 9 fixed-milestone discharge dates when min is null", () => {
    const set = buildDueDateSet(today, null);
    expect(set).toHaveLength(9);
    for (const m of FIXED_MILESTONES) expect(set).toContain(subDays(today, m));
    expect(set).toContain("2026-06-14"); // today - 30
  });
  it("adds bounded post-90 dates and never emits older than min", () => {
    const min = "2026-01-01";
    const set = buildDueDateSet(today, min);
    expect(set).toContain(subDays(today, 120));
    expect(set).toContain(subDays(today, 150));
    expect(set).toContain(subDays(today, 180));
    // today-210 = 2025-12-16 is < min -> excluded
    expect(set).not.toContain(subDays(today, 210));
    for (const d of set) expect(toEpochDay(d)).toBeGreaterThanOrEqual(toEpochDay(min));
  });
  it("caps the look-back so an ancient min can't blow up the IN(...) list", () => {
    // A poison/typo row dated decades ago must not enumerate thousands of dates.
    const set = buildDueDateSet(today, "1990-01-01");
    const floor = toEpochDay(today) - MAX_FOLLOWUP_AGE_DAYS;
    for (const d of set) expect(toEpochDay(d)).toBeGreaterThanOrEqual(floor);
    // 9 fixed + ~(MAX_FOLLOWUP_AGE_DAYS/30) post-90 dates — bounded and small.
    expect(set.length).toBeLessThan(9 + MAX_FOLLOWUP_AGE_DAYS / 30 + 2);
  });
});

describe("buildReachedWindowSet", () => {
  it("covers every discharge date whose milestone fell in the trailing window", () => {
    const today = "2026-07-14";
    const set = new Set(buildReachedWindowSet(today, 1, 7, null));
    // Day 30 reached 2 days ago => discharge today-32.
    expect(set.has(subDays(today, 32))).toBe(true);
    // Day 7 reached 1 day ago => discharge today-8.
    expect(set.has(subDays(today, 8))).toBe(true);
    // today's Day 3 discharge (today-3) should NOT be included (window starts at 1).
    expect(set.has(subDays(today, 3))).toBe(false);
  });
});

describe("formatting", () => {
  it("formats civil dates with no timezone shift", () => {
    expect(formatCivilDate("2026-07-14")).toBe("Jul 14, 2026");
    expect(formatCivilDate("2026-03-08")).toBe("Mar 8, 2026"); // DST day, no shift
    expect(formatCivilDate("2026-01-01")).toBe("Jan 1, 2026");
  });
  it("returns a placeholder for invalid dates", () => {
    expect(formatCivilDate(null)).toBe("—");
    expect(formatCivilDate("bad")).toBe("—");
  });
  it("phrases days-since counts", () => {
    expect(formatDaysSince(0)).toBe("today");
    expect(formatDaysSince(1)).toBe("1 day");
    expect(formatDaysSince(30)).toBe("30 days");
    expect(formatDaysSince(-2)).toBe("in 2 days");
    expect(formatDaysSince(null)).toBe("—");
  });
});
