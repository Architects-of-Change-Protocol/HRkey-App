"use client";

import { useMemo, useState } from "react";

export type ReferenceRequestStatus = "Pending" | "Partial" | "Completed" | "Expired";

export interface ReferenceRequestRow {
  id: string;
  refereeName: string;
  refereeEmail: string;
  relationship: string;
  company: string;
  role: string;
  requestedAt: string;
  status: ReferenceRequestStatus;
}

interface ReferenceRequestsTableProps {
  rows: ReferenceRequestRow[];
}

const formatRequestedAt = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

export default function ReferenceRequestsTable({ rows }: ReferenceRequestsTableProps) {
  const [query, setQuery] = useState("");

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return rows;

    return rows.filter((row) =>
      [row.refereeName, row.refereeEmail, row.relationship, row.company, row.role, row.status].some((value) =>
        value.toLowerCase().includes(normalizedQuery)
      )
    );
  }, [query, rows]);

  return (
    <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-4 shadow-sm sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Reference Requests</h2>
          <p className="text-sm text-slate-600">Track referee outreach and completion in one place.</p>
        </div>
        <div className="flex w-full gap-2 sm:w-auto">
          <label className="relative flex-1 sm:w-72">
            <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400">
              <SearchIcon />
            </span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search referee, company, status..."
              className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--input-background)] py-2 pl-9 pr-3 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--teal-primary)]"
            />
          </label>
        </div>
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--border)] text-sm">
            <thead className="bg-[var(--gray-light)] text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Referee</th>
                <th className="px-4 py-3">Relationship</th>
                <th className="px-4 py-3">Company / Role</th>
                <th className="px-4 py-3">Requested</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] bg-[var(--background)]">
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--foreground)]">{row.refereeName}</p>
                      <p className="text-xs text-slate-600">{row.refereeEmail}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.relationship}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <p>{row.company}</p>
                      <p className="text-xs text-slate-500">{row.role}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatRequestedAt(row.requestedAt)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-8 text-center text-sm text-slate-500" colSpan={5}>
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
    Expired: "#fee2e2",
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
