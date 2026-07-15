/**
 * Server-only data access. This is the ONLY place the follow-up engine meets the
 * database: "today" is computed in America/New_York, the qualifying discharge
 * dates are built in TypeScript, and a single indexed `discharge_date IN (...)`
 * query returns the rows. Nothing about follow-up timing is stored or hardcoded.
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  getTodayNY,
  daysSinceDischarge,
  groupFor,
  isDueToday,
  milestoneReachedWithin,
  buildDueDateSet,
  buildReachedWindowSet,
  ALL_GROUPS,
  type CivilDate,
  type FollowUpGroup,
} from "@/lib/followup";
import type {
  Alumni,
  AlumniWithFollowUp,
  ReachedRecently,
  AlumniQuery,
} from "@/lib/types";
import { CATCHUP_WINDOW_DAYS, DEFAULT_PAGE_SIZE } from "@/lib/constants";

const COLUMNS =
  "id, salesforce_id, full_name, email, phone_number, discharge_date, status, created_at, updated_at";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function decorate(row: Alumni, today: CivilDate): AlumniWithFollowUp {
  const days = daysSinceDischarge(row.discharge_date, today);
  return { ...row, daysSinceDischarge: days, group: groupFor(days) };
}

/** MIN discharge date — bounds the (otherwise unbounded) post-90 tail. */
async function getMinDischarge(supabase: Supabase): Promise<CivilDate | null> {
  const { data, error } = await supabase
    .from("villa_alumni")
    .select("discharge_date")
    .not("discharge_date", "is", null)
    .order("discharge_date", { ascending: true })
    .limit(1);
  if (error) throw error;
  return (data?.[0]?.discharge_date as CivilDate | undefined) ?? null;
}

/** Distinct non-null statuses present, for the All Alumni filter dropdown. */
export async function getDistinctStatuses(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("villa_alumni")
    .select("status")
    .not("status", "is", null);
  if (error) throw error;
  const set = new Set<string>();
  for (const r of (data as { status: string | null }[]) ?? []) {
    if (r.status) set.add(r.status);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Total number of alumni in the table (head count; no rows transferred). */
export async function getAlumniCount(): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("villa_alumni")
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

export interface DueTodayGroup {
  group: FollowUpGroup;
  clients: AlumniWithFollowUp[];
}

export interface DueTodayResult {
  today: CivilDate;
  total: number;
  groups: DueTodayGroup[];
}

/** All alumni whose days-since-discharge equals a milestone today. */
export async function getDueToday(): Promise<DueTodayResult> {
  const supabase = await createClient();
  const today = getTodayNY();
  const min = await getMinDischarge(supabase);
  const dates = buildDueDateSet(today, min);

  const { data, error } = await supabase
    .from("villa_alumni")
    .select(COLUMNS)
    .in("discharge_date", dates);
  if (error) throw error;

  const decorated = (data as Alumni[]).map((r) => decorate(r, today));

  const byGroup = new Map<FollowUpGroup, AlumniWithFollowUp[]>();
  for (const c of decorated) {
    if (!c.group) continue; // defensive: the query should only return due rows
    const list = byGroup.get(c.group) ?? [];
    list.push(c);
    byGroup.set(c.group, list);
  }

  const groups: DueTodayGroup[] = ALL_GROUPS.map((group) => {
    const clients = (byGroup.get(group) ?? []).sort((a, b) => {
      // Post 90 spans many day-counts: most overdue first, then name.
      if (b.daysSinceDischarge !== a.daysSinceDischarge) {
        return (b.daysSinceDischarge ?? 0) - (a.daysSinceDischarge ?? 0);
      }
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });
    return { group, clients };
  });

  const total = decorated.filter((c) => c.group !== null).length;
  return { today, total, groups };
}

/**
 * Stateless catch-up: alumni whose most recent milestone fell in the last N days
 * (excluding today, which is already in "Due Today"). No writes, no state.
 */
export async function getReachedRecently(
  windowDays = CATCHUP_WINDOW_DAYS,
): Promise<ReachedRecently[]> {
  const supabase = await createClient();
  const today = getTodayNY();
  const min = await getMinDischarge(supabase);
  const dates = buildReachedWindowSet(today, 1, windowDays, min);
  if (dates.length === 0) return [];

  const { data, error } = await supabase
    .from("villa_alumni")
    .select(COLUMNS)
    .in("discharge_date", dates);
  if (error) throw error;

  const out: ReachedRecently[] = [];
  for (const row of data as Alumni[]) {
    const days = daysSinceDischarge(row.discharge_date, today);
    if (days === null || isDueToday(days)) continue; // due-today lives elsewhere
    const reached = milestoneReachedWithin(days, 1, windowDays);
    if (!reached) continue;
    out.push({
      ...row,
      daysSinceDischarge: days,
      milestone: reached.milestone,
      group: reached.group,
      daysAgo: reached.daysAgo,
    });
  }

  return out.sort((a, b) => {
    if (a.daysAgo !== b.daysAgo) return a.daysAgo - b.daysAgo; // most recent first
    return (a.full_name ?? "").localeCompare(b.full_name ?? "");
  });
}

export interface AllAlumniResult {
  rows: AlumniWithFollowUp[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Remove characters that would break a PostgREST or()/ilike filter. */
function sanitizeSearch(term: string): string {
  return term.replace(/[%,()\\]/g, " ").trim();
}

/** Server-side search / filter / sort / paginate for the All Alumni table. */
export async function getAllAlumni(query: AlumniQuery): Promise<AllAlumniResult> {
  const supabase = await createClient();
  const today = getTodayNY();

  let q = supabase.from("villa_alumni").select(COLUMNS, { count: "exact" });

  const term = sanitizeSearch(query.search);
  if (term) {
    q = q.or(
      `full_name.ilike.%${term}%,email.ilike.%${term}%,salesforce_id.ilike.%${term}%`,
    );
  }

  if (query.status !== "all") {
    q = q.eq("status", query.status);
  }

  if (query.due !== "all") {
    const min = await getMinDischarge(supabase);
    const dueDates = buildDueDateSet(today, min);
    if (query.due === "due") {
      // "Due today" mirrors the Due Today section: on a milestone today.
      q = q.in("discharge_date", dueDates);
    } else {
      // not_due: null discharge (definitionally not due) OR not in the due set.
      q = q.or(
        `discharge_date.is.null,discharge_date.not.in.(${dueDates.join(",")})`,
      );
    }
  }

  q = q.order(query.sort, {
    ascending: query.direction === "asc",
    nullsFirst: false,
  });
  // Stable tiebreaker (unique column) so pagination never drops/repeats rows.
  q = q.order("salesforce_id", { ascending: true });

  const pageSize = query.pageSize > 0 ? query.pageSize : DEFAULT_PAGE_SIZE;
  const from = (query.page - 1) * pageSize;
  const to = from + pageSize - 1;
  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) throw error;

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const rows = (data as Alumni[]).map((r) => decorate(r, today));

  return { rows, total, page: query.page, pageSize, totalPages };
}
