"use client";

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "…")[] = [];
  const delta = 2;
  const left = current - delta;
  const right = current + delta;

  pages.push(1);

  if (left > 2) pages.push("…");

  for (let i = Math.max(2, left); i <= Math.min(total - 1, right); i++) {
    pages.push(i);
  }

  if (right < total - 1) pages.push("…");

  if (total > 1) pages.push(total);

  return pages;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: PaginationProps) {
  const totalPages = Math.ceil(total / pageSize);
  const rangeStart = (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);
  const pages = pageNumbers(page, totalPages);

  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      {/* Range label */}
      <span className="font-mono text-[11px] text-fg-3 tabular-nums">
        Showing{" "}
        <span className="text-fg-2">
          {rangeStart.toLocaleString()}–{rangeEnd.toLocaleString()}
        </span>{" "}
        of{" "}
        <span className="text-fg-2">{total.toLocaleString()}</span>
      </span>

      {/* Page controls */}
      <div className="flex items-center gap-1">
        {/* Prev */}
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="h-7 w-7 flex items-center justify-center font-mono text-[11px] border border-edge rounded-sm text-fg-2 hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          ‹
        </button>

        {pages.map((p, i) =>
          p === "…" ? (
            <span
              key={`ellipsis-${i}`}
              className="h-7 w-7 flex items-center justify-center font-mono text-[11px] text-fg-3"
            >
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p as number)}
              className={[
                "h-7 w-7 flex items-center justify-center font-mono text-[11px] border rounded-sm transition-colors tabular-nums",
                p === page
                  ? "border-blue/40 bg-blue/10 text-blue"
                  : "border-edge text-fg-3 hover:text-fg hover:bg-surface-2",
              ].join(" ")}
            >
              {p}
            </button>
          )
        )}

        {/* Next */}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="h-7 w-7 flex items-center justify-center font-mono text-[11px] border border-edge rounded-sm text-fg-2 hover:text-fg hover:bg-surface-2 transition-colors disabled:opacity-30 disabled:pointer-events-none"
        >
          ›
        </button>
      </div>
    </div>
  );
}
