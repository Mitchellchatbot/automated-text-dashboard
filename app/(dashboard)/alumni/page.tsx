import { getAllAlumni, getDistinctStatuses } from "@/lib/data/alumni";
import { parseAlumniQuery, alumniHref } from "@/lib/alumniQuery";
import { AlumniToolbar } from "@/components/alumni/AlumniToolbar";
import { AllAlumniTable } from "@/components/alumni/AllAlumniTable";
import { Pagination } from "@/components/ui/Pagination";
import { EmptyState } from "@/components/ui/EmptyState";
import { RevealScope } from "@/components/motion/RevealScope";

export const dynamic = "force-dynamic";

const SearchIcon = (
  <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <circle cx="9" cy="9" r="6" />
    <path d="M14 14l3.6 3.6" />
  </svg>
);
const HeartIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21s-6.5-4.2-6.5-9A3.7 3.7 0 0 1 12 8.6 3.7 3.7 0 0 1 18.5 12c0 4.8-6.5 9-6.5 9z" />
  </svg>
);

export default async function AlumniPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const query = parseAlumniQuery(sp);
  const [result, statuses] = await Promise.all([
    getAllAlumni(query),
    getDistinctStatuses(),
  ]);

  const hasFilters =
    query.search !== "" || query.status !== "all" || query.due !== "all";

  return (
    <RevealScope>
      <header data-reveal>
        <p className="eyebrow">Client records</p>
        <h1>All alumni</h1>
        <p className="lead">
          {result.total} {result.total === 1 ? "record" : "records"} in aftercare · search by name, ID, or status.
        </p>
      </header>

      <div data-reveal data-reveal-delay="60">
        <AlumniToolbar query={query} statuses={statuses} />
      </div>

      {result.total > 0 && (
        <div className="listmeta">
          <span className="count">
            {result.total} {result.total === 1 ? "record" : "records"}
          </span>
          <span className="sortnote">Sorted by most recent discharge</span>
        </div>
      )}

      <div data-reveal data-reveal-delay="120">
        {result.rows.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No matching alumni" : "No alumni yet"}
            description={
              hasFilters
                ? "Try a different name, Salesforce ID, or clear your filters."
                : "Discharged clients appear here after the daily Salesforce sync runs."
            }
            icon={hasFilters ? SearchIcon : HeartIcon}
          />
        ) : (
          <AllAlumniTable rows={result.rows} />
        )}
      </div>

      {result.total > result.pageSize && (
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          total={result.total}
          pageSize={result.pageSize}
          hrefFor={(p) => alumniHref(query, { page: p })}
        />
      )}
    </RevealScope>
  );
}
