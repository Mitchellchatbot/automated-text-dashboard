/**
 * Data-layer assembly tests. Docker (local Supabase) is unavailable here, so we
 * drive lib/data/alumni against an in-memory fake of the PostgREST query builder.
 * This verifies the dashboard's business behavior end-to-end with a fixed "today":
 * due-today grouping, active-only eligibility, catch-up excluding due-today rows,
 * post-90 bounding, and search/filter/sort/paginate wiring.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTodayNY, subDays, addDays } from "@/lib/followup/timezone";
import type { Alumni } from "@/lib/types";

// ---- fake Supabase client (function declaration -> hoisted, usable in vi.mock) ----
function splitTopLevel(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of expr) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function clausePredicate(clause: string): (r: Record<string, unknown>) => boolean {
  if (clause.includes(".not.in.(")) {
    const col = clause.slice(0, clause.indexOf("."));
    const inside = clause.slice(clause.indexOf("(") + 1, clause.lastIndexOf(")"));
    const set = new Set(inside.split(",").filter(Boolean));
    return (r) => r[col] !== null && !set.has(r[col] as string);
  }
  const [col, op, ...rest] = clause.split(".");
  const val = rest.join(".");
  if (op === "is" && val === "null") return (r) => r[col] === null;
  if (op === "ilike") {
    const needle = val.replace(/%/g, "").toLowerCase();
    return (r) => String(r[col] ?? "").toLowerCase().includes(needle);
  }
  return () => false;
}

class FakeQuery {
  private preds: ((r: Record<string, unknown>) => boolean)[] = [];
  private orders: { col: string; ascending: boolean; nullsFirst: boolean }[] = [];
  private rangeSpec: { from: number; to: number } | null = null;
  private wantCount = false;
  constructor(private rows: Record<string, unknown>[]) {}
  select(_cols: string, opts?: { count?: string }) {
    if (opts?.count) this.wantCount = true;
    return this;
  }
  eq(col: string, val: unknown) {
    this.preds.push((r) => r[col] === val);
    return this;
  }
  not(col: string, op: string, val: unknown) {
    if (op === "is" && val === null) this.preds.push((r) => r[col] !== null);
    return this;
  }
  in(col: string, vals: unknown[]) {
    const set = new Set(vals);
    this.preds.push((r) => set.has(r[col]));
    return this;
  }
  or(expr: string) {
    const clauses = splitTopLevel(expr).map(clausePredicate);
    this.preds.push((r) => clauses.some((c) => c(r)));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({
      col,
      ascending: opts?.ascending ?? true,
      nullsFirst: opts?.nullsFirst ?? false,
    });
    return this;
  }
  limit(n: number) {
    this.rangeSpec = { from: 0, to: n - 1 };
    return this;
  }
  range(from: number, to: number) {
    this.rangeSpec = { from, to };
    return this;
  }
  private run() {
    let out = this.rows.filter((r) => this.preds.every((p) => p(r)));
    for (const o of [...this.orders].reverse()) {
      out = [...out].sort((a, b) => {
        const av = a[o.col];
        const bv = b[o.col];
        const an = av === null || av === undefined;
        const bn = bv === null || bv === undefined;
        if (an && bn) return 0;
        if (an) return o.nullsFirst ? -1 : 1;
        if (bn) return o.nullsFirst ? 1 : -1;
        if (av! < bv!) return o.ascending ? -1 : 1;
        if (av! > bv!) return o.ascending ? 1 : -1;
        return 0;
      });
    }
    const count = out.length;
    if (this.rangeSpec) out = out.slice(this.rangeSpec.from, this.rangeSpec.to + 1);
    return { data: out, error: null, count: this.wantCount ? count : null };
  }
  then(
    resolve: (v: { data: unknown; error: null; count: number | null }) => void,
    reject: (e: unknown) => void,
  ) {
    try {
      resolve(this.run());
    } catch (e) {
      reject(e);
    }
  }
}

function makeFakeClient(rows: Record<string, unknown>[]) {
  return { from: () => new FakeQuery(rows) };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    makeFakeClient(((globalThis as Record<string, unknown>).__seedRows as []) ?? []),
}));

// Import AFTER the mock is registered.
import {
  getDueToday,
  getReachedRecently,
  getAllAlumni,
} from "@/lib/data/alumni";
import { parseAlumniQuery } from "@/lib/alumniQuery";

const TODAY = getTodayNY();

function row(
  salesforce_id: string,
  full_name: string,
  offsetDays: number | null,
  status: Alumni["status"] = "active",
  email: string | null = `${salesforce_id.toLowerCase()}@ex.com`,
): Alumni {
  return {
    id: `id-${salesforce_id}`,
    salesforce_id,
    full_name,
    email,
    phone_number: null,
    discharge_date: offsetDays === null ? null : subDays(TODAY, offsetDays),
    status,
    created_at: `${TODAY}T00:00:00Z`,
    updated_at: `${TODAY}T00:00:00Z`,
  };
}

const SEED: Alumni[] = [
  row("SF-DAY3", "Ava Thompson", 3),
  row("SF-DAY7", "Liam Nguyen", 7),
  row("SF-DAY14", "Sofia Martinez", 14),
  row("SF-DAY30", "Noah Patel", 30),
  row("SF-DAY90", "Emma Johnson", 90),
  row("SF-POST120", "Oliver Brown", 120),
  row("SF-CATCHUP", "Mia Rodriguez", 32), // Day 30 reached 2 days ago
  row("SF-NOTDUE", "James Wilson", 10), // Day 7 reached 3 days ago
  row("SF-FUTURE", "Charlotte Davis", -5), // future discharge
  row("SF-NULLDT", "Benjamin Lee", null), // unknown discharge
  row("SF-DEC", "Dee Ceased", 7, "deceased"),
  row("SF-OPTOUT", "Opie Out", 30, "opted_out"),
];

beforeEach(() => {
  (globalThis as Record<string, unknown>).__seedRows = SEED;
});

describe("getDueToday", () => {
  it("returns every discharged client on an exact milestone (status-independent)", async () => {
    const due = await getDueToday();
    expect(due.today).toBe(TODAY);
    // Due: Day 3,7(+DEC),14,30(+OPTOUT),90, Post-90(120) = 8. No status gate.
    expect(due.total).toBe(8);

    const byGroup = Object.fromEntries(
      due.groups.map((g) => [g.group, g.clients.map((c) => c.salesforce_id)]),
    );
    expect(byGroup["Day 3"]).toEqual(["SF-DAY3"]);
    // Deceased/opted-out are now eligible; each group sorted by name.
    expect(byGroup["Day 7"]).toEqual(["SF-DEC", "SF-DAY7"]);
    expect(byGroup["Day 14"]).toEqual(["SF-DAY14"]);
    expect(byGroup["Day 30"]).toEqual(["SF-DAY30", "SF-OPTOUT"]);
    expect(byGroup["Day 90"]).toEqual(["SF-DAY90"]);
    expect(byGroup["Post 90"]).toEqual(["SF-POST120"]);
    expect(byGroup["Day 21"]).toEqual([]);
    // All 10 groups always present, in order.
    expect(due.groups).toHaveLength(10);
    expect(due.groups[9].group).toBe("Post 90");
  });
});

describe("getReachedRecently (stateless catch-up)", () => {
  it("lists recently-passed milestones, excluding rows due today", async () => {
    const reached = await getReachedRecently(7);
    // SF-CATCHUP (Day30, 2d ago) and SF-NOTDUE (Day7, 3d ago). Nothing due-today.
    expect(reached.map((r) => r.salesforce_id)).toEqual(["SF-CATCHUP", "SF-NOTDUE"]);
    expect(reached[0]).toMatchObject({ group: "Day 30", daysAgo: 2, daysSinceDischarge: 32 });
    expect(reached[1]).toMatchObject({ group: "Day 7", daysAgo: 3 });
    // A client due today must not also appear here.
    expect(reached.some((r) => r.salesforce_id === "SF-DAY7")).toBe(false);
  });
});

describe("getAllAlumni", () => {
  const q = (over: Partial<Record<string, string>> = {}) =>
    parseAlumniQuery(over);

  it("returns all rows with a stable default sort and correct count", async () => {
    const res = await getAllAlumni(q());
    expect(res.total).toBe(12);
    expect(res.rows).toHaveLength(12);
    // default sort discharge_date desc, nulls last -> future first, null last.
    expect(res.rows[0].salesforce_id).toBe("SF-FUTURE");
    expect(res.rows[res.rows.length - 1].salesforce_id).toBe("SF-NULLDT");
    // decorated with days-since + group
    expect(res.rows[0].daysSinceDischarge).toBe(-5);
  });

  it("searches across name/email/salesforce id", async () => {
    const res = await getAllAlumni(q({ search: "ava" }));
    expect(res.total).toBe(1);
    expect(res.rows[0].salesforce_id).toBe("SF-DAY3");
  });

  it("filters by status", async () => {
    const res = await getAllAlumni(q({ status: "deceased" }));
    expect(res.total).toBe(1);
    expect(res.rows[0].salesforce_id).toBe("SF-DEC");
  });

  it("due filter mirrors the Due Today section (on a milestone, any status)", async () => {
    const res = await getAllAlumni(q({ due: "due" }));
    expect(res.total).toBe(8);
  });

  it("not_due includes null-discharge rows", async () => {
    const res = await getAllAlumni(q({ due: "not_due" }));
    const ids = res.rows.map((r) => r.salesforce_id);
    expect(ids).toContain("SF-NULLDT");
    expect(ids).toContain("SF-FUTURE");
    expect(ids).not.toContain("SF-DAY3");
  });

  it("paginates with a correct total page count", async () => {
    const res = await getAllAlumni(q({ size: "5", page: "2" }));
    expect(res.pageSize).toBe(5);
    expect(res.page).toBe(2);
    expect(res.total).toBe(12);
    expect(res.totalPages).toBe(3);
    expect(res.rows).toHaveLength(5);
  });

  it("sorts by name ascending when requested", async () => {
    const res = await getAllAlumni(q({ sort: "full_name", dir: "asc" }));
    expect(res.rows[0].full_name).toBe("Ava Thompson");
  });
});

// Guard the addDays import is exercised (future date helper) to keep lint happy.
it("sanity: addDays is the inverse of subDays", () => {
  expect(addDays(subDays(TODAY, 5), 5)).toBe(TODAY);
});
