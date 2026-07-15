import Link from "next/link";

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
}) {
  const clampedPage = Math.min(page, totalPages);
  const first = total === 0 ? 0 : (clampedPage - 1) * pageSize + 1;
  const last = Math.min(clampedPage * pageSize, total);
  const atStart = clampedPage <= 1;
  const atEnd = clampedPage >= totalPages;

  return (
    <div className="pagination">
      <p className="count-text">
        {total === 0 ? "No results" : `Showing ${first}–${last} of ${total}`}
      </p>
      <div className="pager">
        <Link
          href={hrefFor(clampedPage - 1)}
          className={`pgbtn${atStart ? " disabled" : ""}`}
          aria-disabled={atStart}
          scroll={false}
        >
          ← Prev
        </Link>
        <span className="pageinfo">
          Page {clampedPage} of {totalPages}
        </span>
        <Link
          href={hrefFor(clampedPage + 1)}
          className={`pgbtn${atEnd ? " disabled" : ""}`}
          aria-disabled={atEnd}
          scroll={false}
        >
          Next →
        </Link>
      </div>
    </div>
  );
}
