import type { FollowUpGroup } from "@/lib/followup/schedule";

/**
 * Status is the Salesforce Lead Status, stored verbatim (free text). It is
 * display/filter-only — follow-up eligibility does NOT depend on it.
 */
export type AlumniStatus = string;

/** A row of the `villa_alumni` table. */
export interface Alumni {
  id: string;
  salesforce_id: string;
  full_name: string | null;
  email: string | null;
  phone_number: string | null;
  /** Postgres DATE as 'YYYY-MM-DD', or null when unknown. */
  discharge_date: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;
}

/** An alumni row decorated with dashboard-computed, non-persisted fields. */
export interface AlumniWithFollowUp extends Alumni {
  daysSinceDischarge: number | null;
  group: FollowUpGroup | null;
}

/** A row in the stateless "reached in the last N days" catch-up list. */
export interface ReachedRecently extends Alumni {
  daysSinceDischarge: number;
  milestone: number;
  group: FollowUpGroup;
  /** How many days ago the milestone was reached (>= 1). */
  daysAgo: number;
}

/* ---- All Alumni query params (URL-state) ---- */

export const SORT_FIELDS = [
  "full_name",
  "discharge_date",
  "status",
] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export type SortDirection = "asc" | "desc";

export const DUE_FILTERS = ["all", "due", "not_due"] as const;
export type DueFilter = (typeof DUE_FILTERS)[number];

export interface AlumniQuery {
  search: string;
  /** Raw status value, or "all". Free-form (Salesforce Lead Status). */
  status: string;
  due: DueFilter;
  sort: SortField;
  direction: SortDirection;
  page: number;
  pageSize: number;
}
