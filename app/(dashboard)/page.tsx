import { getDueToday, getReachedRecently, getAlumniCount } from "@/lib/data/alumni";
import { CATCHUP_WINDOW_DAYS } from "@/lib/constants";
import { formatCivilDate, formatDaysSince } from "@/lib/followup";
import {
  DueTodayView,
  type ClientLite,
  type ReachedLite,
} from "@/components/followups/DueTodayView";
import type { AlumniWithFollowUp, ReachedRecently } from "@/lib/types";

// "today" changes daily; never cache this page.
export const dynamic = "force-dynamic";

const toClient = (c: AlumniWithFollowUp): ClientLite => ({
  id: c.id,
  name: c.full_name ?? "Unnamed",
  sf: c.salesforce_id,
  days: formatDaysSince(c.daysSinceDischarge),
  date: formatCivilDate(c.discharge_date),
});

const toReached = (r: ReachedRecently): ReachedLite => ({
  ...toClient(r),
  group: r.group,
  daysAgo: r.daysAgo,
});

export default async function DueTodayPage() {
  const [due, reached, totalAlumni] = await Promise.all([
    getDueToday(),
    getReachedRecently(CATCHUP_WINDOW_DAYS),
    getAlumniCount(),
  ]);

  return (
    <DueTodayView
      todayLabel={formatCivilDate(due.today)}
      totalDue={due.total}
      reachedCount={reached.length}
      totalAlumni={totalAlumni}
      activeMilestones={due.groups.filter((g) => g.clients.length > 0).length}
      groups={due.groups.map((g) => ({
        group: g.group,
        clients: g.clients.map(toClient),
      }))}
      reached={reached.map(toReached)}
      windowDays={CATCHUP_WINDOW_DAYS}
    />
  );
}
