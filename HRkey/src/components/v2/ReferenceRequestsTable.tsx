"use client";

import { useMemo, useState } from "react";

export type ReferenceRequestStatus = "Pending" | "Partial" | "Completed";

export interface ReferenceRequestRow {
  id: string;
  candidateName: string;
  role: string;
  requestedAt: string;
  status: ReferenceRequestStatus;
}

interface ReferenceRequestsTableProps {
  rows: ReferenceRequestRow[];
}

export default function ReferenceRequestsTable({ rows }: ReferenceRequestsTableProps) {
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rows;

    return rows.filter((row) =>
      [row.candidateName, row.role, row.status, row.requestedAt].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    );
  }, [query, rows]);

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Reference Requests</h2>
          <p className="text-sm text-slate-600">Track reference progress across your candidate pipeline.</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-72">
            <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400">
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search candidate, role, status..."
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--input-background)] py-2 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--teal-primary)]"
            />
          </label>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--gray-light)] px-3 py-2 text-sm text-slate-700"
          >
            <FilterIcon />
            Filter
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
            <thead className="bg-[var(--gray-light)] text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--background)]">
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">{row.candidateName}</td>
                    <td className="px-4 py-3 text-slate-700">{row.role}</td>
                    <td className="px-4 py-3 text-slate-600">{row.requestedAt}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={4}>
                    No requests match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: ReferenceRequestStatus }) {
  const colorsByStatus: Record<ReferenceRequestStatus, string> = {
    Pending: "var(--gray-badge)",
    Partial: "var(--teal-light)",
    Completed: "var(--teal-primary)",
  };

  const textColor = status === "Completed" ? "#ffffff" : "var(--foreground)";

  return (
    <span
      className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold"
      style={{ backgroundColor: colorsByStatus[status], color: textColor }}
    >
      {status}
    </span>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.5 10 19 14 21 14 12.5 22 3" />
    </svg>
  );
}
