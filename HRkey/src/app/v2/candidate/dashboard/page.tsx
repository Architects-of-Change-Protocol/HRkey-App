import Link from "next/link";
import ReferenceRequestsTable, { type ReferenceRequestRow } from "@/components/v2/ReferenceRequestsTable";
import V2Shell from "@/components/v2/V2Shell";

const MOCK_REFERENCE_REQUESTS: ReferenceRequestRow[] = [
  {
    id: "req-01",
    candidateName: "Avery Morgan",
    role: "Senior Product Designer",
    requestedAt: "Apr 24, 2026",
    status: "Pending",
  },
  {
    id: "req-02",
    candidateName: "Jordan Patel",
    role: "People Operations Lead",
    requestedAt: "Apr 22, 2026",
    status: "Partial",
  },
  {
    id: "req-03",
    candidateName: "Samira Chen",
    role: "Engineering Manager",
    requestedAt: "Apr 19, 2026",
    status: "Completed",
  },
  {
    id: "req-04",
    candidateName: "Diego Alvarez",
    role: "Revenue Operations Analyst",
    requestedAt: "Apr 17, 2026",
    status: "Completed",
  },
];

export default function CandidateDashboardV2Page() {
  return (
    <V2Shell
      active="candidate-dashboard"
      userType="candidate"
      title="Candidate dashboard"
      subtitle="Monitor profile progress and track incoming reference activity."
    >
      <div className="space-y-6">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--teal-soft)] p-4">
          <p className="text-sm text-[var(--foreground)]">
            TODO: Connect candidate metrics, reference requests, and profile completeness data.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Profile completion", "72%"],
            ["References requested", "14"],
            ["Verified references", "9"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-[var(--foreground)]">{value}</p>
            </div>
          ))}
        </div>

        <ReferenceRequestsTable rows={MOCK_REFERENCE_REQUESTS} />

        <div className="flex flex-wrap gap-3">
          <Link href="/v2/onboarding?type=candidate" className="rounded-[var(--radius)] bg-[var(--teal-primary)] px-4 py-2 text-sm font-semibold text-white">
            Edit onboarding answers
          </Link>
          <Link href="/landing/index.html" className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-700">
            Return to landing
          </Link>
        </div>
      </div>
    </V2Shell>
  );
}
