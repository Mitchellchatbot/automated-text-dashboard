"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { alumniHref } from "@/lib/alumniQuery";
import type { AlumniQuery, DueFilter } from "@/lib/types";

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "all", label: "Any schedule" },
  { value: "due", label: "Due today" },
  { value: "not_due", label: "Not due today" },
];

export function AlumniToolbar({
  query,
  statuses,
}: {
  query: AlumniQuery;
  statuses: string[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState(query.search);
  const [syncedSearch, setSyncedSearch] = useState(query.search);
  const mounted = useRef(false);

  // Adjust local input when the URL's search changes externally (back/forward).
  if (query.search !== syncedSearch) {
    setSyncedSearch(query.search);
    setSearch(query.search);
  }

  // Debounce search -> URL. Use replace (not push) so the free-text term — which
  // is PHI (names/emails) — does not pile up in browser history. Combined with
  // Referrer-Policy: no-referrer (next.config.ts), the term never leaves the app
  // via history or Referer. (It is still present in the request URL, so server
  // access logs will capture it — see the follow-up note in the hardening plan.)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const t = setTimeout(() => {
      if (search !== query.search) {
        router.replace(alumniHref(query, { search }));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search, query, router]);

  return (
    <div className="controls">
      <div className="searchbox">
        <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
          <circle cx="9" cy="9" r="6" />
          <path d="M14 14l3.6 3.6" />
        </svg>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, or Salesforce ID…"
          aria-label="Search alumni"
          autoComplete="off"
        />
        {search && (
          <button
            type="button"
            className="clearbtn"
            aria-label="Clear search"
            onClick={() => setSearch("")}
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
              <path d="M4 4l6 6M10 4l-6 6" />
            </svg>
          </button>
        )}
      </div>

      <span className={`sb-slot${query.status !== "all" ? " sb-on" : ""}`}>
        <select
          className="select"
          aria-label="Filter by status"
          value={query.status}
          onChange={(e) => router.push(alumniHref(query, { status: e.target.value }))}
        >
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </span>

      <span className={`sb-slot${query.due !== "all" ? " sb-on" : ""}`}>
        <select
          className="select"
          aria-label="Filter by follow-up schedule"
          value={query.due}
          onChange={(e) => router.push(alumniHref(query, { due: e.target.value as DueFilter }))}
        >
          {DUE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </span>
    </div>
  );
}
