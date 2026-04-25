import Link from "next/link";
import V2Shell from "@/components/v2/V2Shell";

export default function CompanyDashboardV2Page() {
  return (
    <V2Shell
      active="company-dashboard"
      userType="company"
      title="Company dashboard (V2 placeholder)"
      subtitle="Hiring intelligence and verified reference review hub."
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-cyan-100 bg-cyan-50 p-4">
          <p className="text-sm text-cyan-900">
            TODO: Connect company hiring pipeline, candidate list, and paid reference access events.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Open roles", "0"],
            ["Candidates under review", "0"],
            ["Verified references unlocked", "0"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/v2/onboarding?type=company" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Edit onboarding answers
          </Link>
          <Link href="/landing/index.html" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            Return to landing
          </Link>
        </div>
      </div>
    </V2Shell>
  );
}
