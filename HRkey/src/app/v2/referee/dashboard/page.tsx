import Link from "next/link";
import V2Shell from "@/components/v2/V2Shell";

const heroStats = [
  { label: "References Given", value: "24", detail: "+3 this month" },
  { label: "Reusable References", value: "11", detail: "Ready to share" },
  { label: "Pending Requests", value: "4", detail: "Needs your response" },
  { label: "Trust Score", value: "96", detail: "Top 8% on HRKey" },
  { label: "Earnings", value: "Coming soon", detail: "Monetization beta" },
] as const;

const givenReferences = [
  { id: "r-1", candidate: "Maya Chen", role: "Senior Product Manager", date: "Apr 22, 2026", score: "4.9" },
  { id: "r-2", candidate: "James Okafor", role: "Engineering Manager", date: "Apr 17, 2026", score: "4.8" },
  { id: "r-3", candidate: "Elena Torres", role: "Revenue Operations Lead", date: "Apr 8, 2026", score: "4.7" },
] as const;

const reusableVault = [
  "Team leadership and hiring rigor",
  "Cross-functional stakeholder alignment",
  "Operational excellence under pressure",
] as const;

const pendingRequests = [
  { candidate: "Noah Patel", role: "Staff Software Engineer", company: "Lattice", age: "2h ago" },
  { candidate: "Sofia Kim", role: "Senior Data Analyst", company: "Atlassian", age: "Yesterday" },
] as const;

const roleBadges = ["People Manager", "Hiring Panel Lead", "Reference Top Contributor"] as const;
const industries = ["SaaS", "Fintech", "HealthTech"] as const;

export default function RefereeDashboardV2Page() {
  return (
    <V2Shell
      active="referee-dashboard"
      userType="referee"
      title="Referee Dashboard"
      subtitle="Premium workspace to manage requests, reusable references, and credibility at a glance."
    >
      <div className="space-y-5 pb-20">
        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white shadow-xl sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-teal-300">HRKey Referee Pro</p>
              <h2 className="mt-1 text-xl font-bold">Your verified voice drives trusted hiring.</h2>
            </div>
            <Link
              href="/v2/onboarding/details"
              className="rounded-lg border border-teal-300/40 bg-teal-500/10 px-3 py-2 text-xs font-semibold text-teal-100"
            >
              Complete Profile
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            {heroStats.map((stat) => (
              <article key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{stat.label}</p>
                <p className="mt-2 text-lg font-bold text-white">{stat.value}</p>
                <p className="text-xs text-teal-200/80">{stat.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">My References Given</h3>
              <input
                type="search"
                placeholder="Search by candidate or role"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none ring-teal-200 focus:ring sm:w-56"
              />
            </div>

            <div className="space-y-2">
              {givenReferences.map((item) => (
                <article key={item.id} className="rounded-xl border border-slate-200 p-3 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.candidate}</p>
                      <p className="text-xs text-slate-600">{item.role}</p>
                    </div>
                    <p className="rounded-full bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-700">Score {item.score}</p>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Submitted {item.date}</p>
                </article>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">Reusable References Vault</h3>
              <p className="mt-1 text-xs text-slate-600">Instantly reuse approved content for matching roles.</p>
              <ul className="mt-3 space-y-2">
                {reusableVault.map((item) => (
                  <li key={item} className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">Profile Credibility</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {roleBadges.map((badge) => (
                  <span key={badge} className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                    {badge}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-600">Industries: {industries.join(" • ")}</p>
              <p className="mt-1 text-xs text-slate-600">Manager history: 8 years leading teams of 6–20 people.</p>
            </section>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-900">Pending Requests</h3>
            <Link href="/v2/candidate/references/requests" className="text-xs font-semibold text-teal-700">
              View all requests
            </Link>
          </div>

          <div className="mt-3 space-y-2">
            {pendingRequests.map((request) => (
              <article key={`${request.candidate}-${request.role}`} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{request.candidate}</p>
                    <p className="text-xs text-slate-600">
                      {request.role} · {request.company}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500">{request.age}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">
                    Approve
                  </button>
                  <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
                    Respond
                  </button>
                  <button type="button" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                    Decline
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-teal-200 bg-gradient-to-r from-teal-50 to-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Monetization Teaser</p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">Get paid when companies consult your verified reference content.</h3>
          <p className="mt-2 text-sm text-slate-700">
            Join the premium waitlist to unlock payouts, consultation credits, and preferred visibility in recruiter searches.
          </p>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 p-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3">
          <p className="text-xs text-slate-200">Boost trust score by completing your profile.</p>
          <Link
            href="/v2/onboarding/details"
            className="rounded-lg bg-teal-500 px-4 py-2 text-xs font-semibold text-slate-950"
          >
            Complete Profile
          </Link>
        </div>
      </div>
    </V2Shell>
  );
}
