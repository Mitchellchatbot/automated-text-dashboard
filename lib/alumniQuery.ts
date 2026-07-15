import {
  DUE_FILTERS,
  SORT_FIELDS,
  type AlumniQuery,
  type DueFilter,
  type SortDirection,
  type SortField,
} from "@/lib/types";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@/lib/constants";

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

/** Parse (and clamp/validate) URL search params into a typed AlumniQuery. */
export function parseAlumniQuery(params: RawParams): AlumniQuery {
  // Status is free-form (raw Salesforce value); accept any non-empty string.
  const statusRaw = first(params.status).trim();
  const status: string = statusRaw === "" ? "all" : statusRaw;

  const dueRaw = first(params.due);
  const due: DueFilter = (DUE_FILTERS as readonly string[]).includes(dueRaw)
    ? (dueRaw as DueFilter)
    : "all";

  const sortRaw = first(params.sort);
  const sort: SortField = (SORT_FIELDS as readonly string[]).includes(sortRaw)
    ? (sortRaw as SortField)
    : "discharge_date";

  const direction: SortDirection = first(params.dir) === "asc" ? "asc" : "desc";

  const page = Math.max(1, Number.parseInt(first(params.page), 10) || 1);

  const sizeRaw = Number.parseInt(first(params.size), 10) || DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(5, sizeRaw));

  return { search: first(params.search), status, due, sort, direction, page, pageSize };
}

/** Serialize an AlumniQuery to a URL search string, omitting defaults. */
export function alumniQueryToString(q: AlumniQuery): string {
  const sp = new URLSearchParams();
  if (q.search) sp.set("search", q.search);
  if (q.status !== "all") sp.set("status", q.status);
  if (q.due !== "all") sp.set("due", q.due);
  if (q.sort !== "discharge_date") sp.set("sort", q.sort);
  if (q.direction !== "desc") sp.set("dir", q.direction);
  if (q.page !== 1) sp.set("page", String(q.page));
  if (q.pageSize !== DEFAULT_PAGE_SIZE) sp.set("size", String(q.pageSize));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Build an href with a subset of fields overridden (page resets unless set). */
export function alumniHref(base: AlumniQuery, overrides: Partial<AlumniQuery>): string {
  const next: AlumniQuery = { ...base, page: 1, ...overrides };
  return `/alumni${alumniQueryToString(next)}`;
}
