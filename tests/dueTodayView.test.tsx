import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DueTodayView, type GroupLite } from "@/components/followups/DueTodayView";

/**
 * Renders the real Due Today component (SSR) to confirm it is data-driven: the
 * empty state shows when there are no alumni (the live reality) and contains NO
 * sample data, and a populated case renders the hero, timeline, and client cards.
 */
describe("DueTodayView (real frontend, data-driven)", () => {
  it("shows the empty state with zero alumni and no fabricated data", () => {
    const html = renderToStaticMarkup(
      <DueTodayView
        todayLabel="July 15, 2026"
        totalDue={0}
        reachedCount={0}
        totalAlumni={0}
        activeMilestones={0}
        groups={[]}
        reached={[]}
        windowDays={7}
      />,
    );
    expect(html).toContain("No alumni yet");
    expect(html).not.toMatch(/Ava Thompson|Dana Cole|LD-10\d\d|Working - Contacted/);
  });

  it("renders hero, timeline and section cards when populated", () => {
    const groups: GroupLite[] = [
      {
        group: "Day 3",
        clients: [
          {
            id: "1",
            name: "Jordan Rivera",
            sf: "SF-001",
            days: "3 days",
            date: "Jul 12, 2026",
            detail: {
              id: "1",
              salesforce_id: "SF-001",
              full_name: "Jordan Rivera",
              email: null,
              phone_number: null,
              discharge_date: "2026-07-12",
              status: null,
              created_at: "2026-07-12T00:00:00Z",
              updated_at: "2026-07-12T00:00:00Z",
              daysSinceDischarge: 3,
              group: "Day 3",
            },
          },
        ],
      },
      { group: "Post 90", clients: [] },
    ];
    const html = renderToStaticMarkup(
      <DueTodayView
        todayLabel="July 15, 2026"
        totalDue={1}
        reachedCount={0}
        totalAlumni={1}
        activeMilestones={1}
        groups={groups}
        reached={[]}
        windowDays={7}
      />,
    );
    expect(html).toContain("require follow-up today");
    expect(html).toContain("Jordan Rivera");
    expect(html).toContain("SF-001");
    expect(html).toContain('class="marker'); // timeline
    expect(html).toContain('class="msec"'); // section card
  });

  it("shows the caught-up state when alumni exist but none are due", () => {
    const html = renderToStaticMarkup(
      <DueTodayView
        todayLabel="July 15, 2026"
        totalDue={0}
        reachedCount={0}
        totalAlumni={42}
        activeMilestones={0}
        groups={[{ group: "Day 3", clients: [] }]}
        reached={[]}
        windowDays={7}
      />,
    );
    expect(html).toContain("all caught up");
    expect(html).toContain("no follow-ups due today");
  });
});
