"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import V2Shell from "@/components/v2/V2Shell";

type MarketplaceReference = {
  id: string;
  referee: string;
  role: string;
  company: string;
  trustScore: number;
  priceCredits: number;
  freshnessDays: number;
  verifiedTenureYears: number;
  featured?: boolean;
  reviews: Array<{ rating: number; note: string; buyer: string }>;
};

const marketplaceReferences: MarketplaceReference[] = [
  {
    id: "ref-s1",
    referee: "Angela Ruiz",
    role: "Sales Manager",
    company: "HubSpot",
    trustScore: 98,
    priceCredits: 28,
    freshnessDays: 4,
    verifiedTenureYears: 6,
    featured: true,
    reviews: [
      { rating: 5, note: "Tight detail on quota leadership and pipeline coaching.", buyer: "Airtable" },
      { rating: 5, note: "Directly helped us de-risk final interview.", buyer: "Rippling" },
    ],
  },
  {
    id: "ref-e1",
    referee: "Rahul Menon",
    role: "Engineer",
    company: "Stripe",
    trustScore: 95,
    priceCredits: 34,
    freshnessDays: 11,
    verifiedTenureYears: 8,
    featured: true,
    reviews: [{ rating: 5, note: "Clear signal on system design depth.", buyer: "Figma" }],
  },
  {
    id: "ref-f1",
    referee: "Marta Klein",
    role: "Finance Director",
    company: "Datadog",
    trustScore: 92,
    priceCredits: 24,
    freshnessDays: 7,
    verifiedTenureYears: 9,
    reviews: [{ rating: 4, note: "Strong commentary on forecasting discipline.", buyer: "Notion" }],
  },
  {
    id: "ref-e2",
    referee: "Ethan Brooks",
    role: "Engineer",
    company: "Atlassian",
    trustScore: 90,
    priceCredits: 20,
    freshnessDays: 20,
    verifiedTenureYears: 5,
    reviews: [{ rating: 4, note: "Good collaboration and execution examples.", buyer: "Plaid" }],
  },
];

const roleFilters = ["All", "Sales Manager", "Engineer", "Finance Director"] as const;
type RoleFilter = (typeof roleFilters)[number];
type SortOption = "trust" | "price" | "freshness" | "tenure";

function avgRating(reviews: MarketplaceReference["reviews"]) {
  if (!reviews.length) return 0;
  return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
}

export default function CompanyDashboardV2Page() {
  const [credits, setCredits] = useState(210);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("All");
  const [sortBy, setSortBy] = useState<SortOption>("trust");
  const [query, setQuery] = useState("");
  const [requestedIds, setRequestedIds] = useState<string[]>([]);
  const [purchasedIds, setPurchasedIds] = useState<string[]>([]);

  const filteredReferences = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();

    const visible = marketplaceReferences.filter((reference) => {
      const roleMatch = roleFilter === "All" || reference.role === roleFilter;
      if (!roleMatch) return false;

      if (!normalizedQuery) return true;

      return [reference.referee, reference.role, reference.company]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    const sorted = [...visible].sort((a, b) => {
      if (sortBy === "trust") return b.trustScore - a.trustScore;
      if (sortBy === "price") return a.priceCredits - b.priceCredits;
      if (sortBy === "freshness") return a.freshnessDays - b.freshnessDays;
      return b.verifiedTenureYears - a.verifiedTenureYears;
    });

    return sorted;
  }, [query, roleFilter, sortBy]);

  const featured = useMemo(
    () => marketplaceReferences.filter((reference) => reference.featured).sort((a, b) => b.trustScore - a.trustScore),
    [],
  );

  const buyReference = (referenceId: string, cost: number) => {
    if (credits < cost || purchasedIds.includes(referenceId)) return;
    setCredits((current) => current - cost);
    setPurchasedIds((current) => [...current, referenceId]);
    setRequestedIds((current) => current.filter((id) => id !== referenceId));
  };

  const requestAccess = (referenceId: string) => {
    if (requestedIds.includes(referenceId) || purchasedIds.includes(referenceId)) return;
    setRequestedIds((current) => [...current, referenceId]);
  };

  return (
    <V2Shell
      active="company-dashboard"
      userType="company"
      title="Reference Marketplace"
      subtitle="Discover reusable references by role, sort by trust and verification quality, and unlock fast hiring signal."
    >
      <div className="space-y-6 pb-10">
        <section className="rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50 to-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Company Dashboard</p>
              <h2 className="mt-1 text-xl font-bold text-slate-900">Reference Credits Wallet</h2>
              <p className="mt-1 text-sm text-slate-600">Spend credits to instantly unlock verified references or request access for manual review.</p>
            </div>
            <div className="rounded-xl border border-teal-200 bg-white p-4 text-right shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Available credits</p>
              <p className="mt-1 text-3xl font-bold text-slate-900">{credits}</p>
              <p className="text-xs text-slate-500">+50 refresh every billing cycle</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-52 flex-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search reusable references</label>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by role, referee, or company"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-200 focus:ring"
              />
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Role</label>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
                className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                {roleFilters.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sort by</label>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as SortOption)}
                className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="trust">Trust score</option>
                <option value="price">Price</option>
                <option value="freshness">Freshness</option>
                <option value="tenure">Verified tenure</option>
              </select>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {filteredReferences.map((reference) => {
              const purchased = purchasedIds.includes(reference.id);
              const requested = requestedIds.includes(reference.id);

              return (
                <article key={reference.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{reference.referee}</p>
                        {reference.featured ? (
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            Featured
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-600">
                        {reference.role} · {reference.company}
                      </p>
                    </div>
                    <p className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">{reference.priceCredits} credits</p>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
                    <p>Trust score: <span className="font-semibold text-slate-900">{reference.trustScore}</span></p>
                    <p>Freshness: <span className="font-semibold text-slate-900">{reference.freshnessDays} days</span></p>
                    <p>Verified tenure: <span className="font-semibold text-slate-900">{reference.verifiedTenureYears} years</span></p>
                    <p>Usefulness: <span className="font-semibold text-slate-900">{avgRating(reference.reviews).toFixed(1)} / 5</span></p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => buyReference(reference.id, reference.priceCredits)}
                      disabled={purchased || credits < reference.priceCredits}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {purchased ? "Purchased" : "Buy access"}
                    </button>
                    <button
                      type="button"
                      onClick={() => requestAccess(reference.id)}
                      disabled={requested || purchased}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {requested ? "Request submitted" : "Request access"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Featured Top Referees</h3>
            <ul className="mt-3 space-y-2">
              {featured.map((referee) => (
                <li key={referee.id} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{referee.referee}</p>
                  <p className="text-xs text-slate-600">{referee.role} · Trust {referee.trustScore} · {referee.verifiedTenureYears} years verified tenure</p>
                </li>
              ))}
            </ul>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Reviews on Reference Usefulness</h3>
            <div className="mt-3 space-y-2">
              {marketplaceReferences.flatMap((reference) =>
                reference.reviews.slice(0, 1).map((review, index) => (
                  <div key={`${reference.id}-${index}`} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-xs font-semibold text-slate-700">
                      {reference.referee} · {review.rating}/5 by {review.buyer}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">“{review.note}”</p>
                  </div>
                )),
              )}
            </div>
          </article>
        </section>

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
