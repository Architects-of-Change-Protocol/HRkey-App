"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import V2Shell from "@/components/v2/V2Shell";
import {
  buildMarketplaceTransaction,
  DEFAULT_COMPANY_LEDGER,
  loadCompanyLedger,
  persistCompanyLedger,
  type MarketplaceLedger,
} from "@/lib/v2/marketplace-engine";

type MarketplaceReference = {
  id: string;
  referee: string;
  role: string;
  company: string;
  trustScore: number;
  priceCredits: number;
  freshnessDays: number;
  verifiedTenureYears: number;
  usedByCount: number;
  relationshipType: string;
  previewSummary: string;
  fullReference: string;
  kpis: Array<{ label: string; score: number }>;
  managerNotes?: string;
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
    usedByCount: 14,
    relationshipType: "Direct manager",
    previewSummary: "Scaled a 12-person AE team, lifted close rates, and built repeatable coaching loops.",
    fullReference:
      "Angela built a metrics-first sales culture, improved forecast accuracy, and coached underperformers into top quartile execution within two quarters.",
    kpis: [
      { label: "Quota Attainment", score: 4.9 },
      { label: "Pipeline Quality", score: 4.8 },
      { label: "Coaching Effectiveness", score: 5 },
    ],
    managerNotes: "Strong operator for growth-stage GTM buildouts.",
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
    usedByCount: 9,
    relationshipType: "Tech lead",
    previewSummary: "High signal on architecture judgement, mentoring, and ownership under ambiguity.",
    fullReference:
      "Rahul consistently designed resilient backend systems, mentored senior ICs, and handled high-severity incidents with calm ownership and excellent communication.",
    kpis: [
      { label: "System Design", score: 4.9 },
      { label: "Execution Velocity", score: 4.7 },
      { label: "Mentorship", score: 4.8 },
    ],
    managerNotes: "Best fit for high-availability product surfaces.",
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
    usedByCount: 6,
    relationshipType: "Cross-functional partner",
    previewSummary: "Strong forecasting rigor, board-ready communication, and measurable efficiency wins.",
    fullReference:
      "Marta drove operating discipline across planning cycles, tightened spend governance, and influenced leadership with clear scenario modeling.",
    kpis: [
      { label: "Forecast Accuracy", score: 4.8 },
      { label: "Financial Strategy", score: 4.7 },
      { label: "Cross-functional Influence", score: 4.6 },
    ],
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
    usedByCount: 4,
    relationshipType: "Engineering manager",
    previewSummary: "Reliable execution and collaboration signal for distributed product teams.",
    fullReference:
      "Ethan consistently shipped critical roadmap items, collaborated effectively across product/design, and improved quality through pragmatic process upgrades.",
    kpis: [
      { label: "Delivery Reliability", score: 4.5 },
      { label: "Code Quality", score: 4.4 },
      { label: "Collaboration", score: 4.6 },
    ],
    managerNotes: "Excellent in cross-time-zone team environments.",
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
  const [ledger, setLedger] = useState<MarketplaceLedger>(DEFAULT_COMPANY_LEDGER);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("All");
  const [sortBy, setSortBy] = useState<SortOption>("trust");
  const [query, setQuery] = useState("");
  const [topUpOpen, setTopUpOpen] = useState(false);
  const [customTopUp, setCustomTopUp] = useState("75");

  useEffect(() => {
    setLedger(loadCompanyLedger());
  }, []);

  useEffect(() => {
    persistCompanyLedger(ledger);
  }, [ledger]);

  const filteredReferences = useMemo(() => {
    const normalizedQuery = query.toLowerCase().trim();

    const visible = marketplaceReferences.filter((reference) => {
      const roleMatch = roleFilter === "All" || reference.role === roleFilter;
      if (!roleMatch) return false;

      if (!normalizedQuery) return true;

      return [reference.referee, reference.role, reference.company, reference.previewSummary]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    return [...visible].sort((a, b) => {
      if (sortBy === "trust") return b.trustScore - a.trustScore;
      if (sortBy === "price") return a.priceCredits - b.priceCredits;
      if (sortBy === "freshness") return a.freshnessDays - b.freshnessDays;
      return b.verifiedTenureYears - a.verifiedTenureYears;
    });
  }, [query, roleFilter, sortBy]);

  const featured = useMemo(
    () => marketplaceReferences.filter((reference) => reference.featured).sort((a, b) => b.trustScore - a.trustScore),
    [],
  );

  const purchasedReferences = useMemo(
    () => marketplaceReferences.filter((reference) => ledger.purchasedIds.includes(reference.id)),
    [ledger.purchasedIds],
  );

  const companySpend = useMemo(() => ledger.transactions.reduce((sum, tx) => sum + tx.amountCredits, 0), [ledger.transactions]);
  const hrkeyRevenue = useMemo(
    () => ledger.transactions.reduce((sum, tx) => sum + tx.hrkeyRevenueCredits, 0),
    [ledger.transactions],
  );

  const toggleWatchlist = (referenceId: string) => {
    setLedger((current) => {
      const exists = current.watchlist.includes(referenceId);
      return {
        ...current,
        watchlist: exists ? current.watchlist.filter((id) => id !== referenceId) : [...current.watchlist, referenceId],
      };
    });
  };

  const topUpCredits = (amount: number) => {
    if (!amount || amount < 1) return;
    setLedger((current) => ({ ...current, walletCredits: current.walletCredits + amount }));
    setTopUpOpen(false);
  };

  const buyReference = (reference: MarketplaceReference) => {
    if (ledger.walletCredits < reference.priceCredits || ledger.purchasedIds.includes(reference.id)) return;

    setLedger((current) => ({
      ...current,
      walletCredits: current.walletCredits - reference.priceCredits,
      purchasedIds: [...current.purchasedIds, reference.id],
      transactions: [
        buildMarketplaceTransaction({
          referenceId: reference.id,
          referee: reference.referee,
          role: reference.role,
          company: reference.company,
          amountCredits: reference.priceCredits,
        }),
        ...current.transactions,
      ],
    }));
  };

  return (
    <V2Shell
      active="company-dashboard"
      userType="company"
      title="Reference Marketplace"
      subtitle="Buy trusted reusable references instantly, unlock full decision packets, and track every credit in one premium workspace."
    >
      <div className="space-y-6 pb-10">
        <section className="rounded-2xl border border-teal-900/30 bg-slate-950 p-5 text-white shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-300">Company Credit Wallet</p>
              <h2 className="mt-1 text-xl font-bold">Spend credits on verified professional signal</h2>
              <p className="mt-1 text-sm text-slate-300">Verified professional signal • Freshly updated • High usefulness rating.</p>
            </div>
            <div className="rounded-xl border border-teal-500/30 bg-slate-900 p-4 text-right shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Available credits</p>
              <p className="mt-1 text-3xl font-bold text-white">{ledger.walletCredits.toFixed(2)}</p>
              <button
                type="button"
                onClick={() => setTopUpOpen(true)}
                className="mt-2 rounded-lg bg-teal-500 px-3 py-2 text-xs font-semibold text-slate-950"
              >
                Top Up Credits
              </button>
            </div>
          </div>
          <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
            <p className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">Total company spend: <span className="font-semibold">{companySpend.toFixed(2)} credits</span></p>
            <p className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">HRKey platform revenue: <span className="font-semibold">{hrkeyRevenue.toFixed(2)} credits</span></p>
            <p className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">Saved watchlist profiles: <span className="font-semibold">{ledger.watchlist.length}</span></p>
          </div>
        </section>

        {topUpOpen ? (
          <section className="rounded-2xl border border-teal-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">Top Up Credits</h3>
              <button type="button" onClick={() => setTopUpOpen(false)} className="text-xs font-semibold text-slate-500">Close</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[25, 50, 100].map((amount) => (
                <button key={amount} type="button" onClick={() => topUpCredits(amount)} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
                  <p className="text-xs text-slate-500">Instant top up</p>
                  <p className="text-lg font-bold text-slate-900">${amount}</p>
                </button>
              ))}
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Custom</p>
                <input
                  value={customTopUp}
                  onChange={(event) => setCustomTopUp(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                />
                <button type="button" onClick={() => topUpCredits(Number(customTopUp))} className="mt-2 w-full rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white">
                  Confirm Top Up
                </button>
              </div>
            </div>
          </section>
        ) : null}

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
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as RoleFilter)} className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {roleFilters.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sort by</label>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className="mt-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <option value="trust">Trust score</option><option value="price">Price</option><option value="freshness">Freshness</option><option value="tenure">Verified tenure</option>
              </select>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {filteredReferences.map((reference) => {
              const purchased = ledger.purchasedIds.includes(reference.id);
              const watched = ledger.watchlist.includes(reference.id);

              return (
                <article key={reference.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{reference.referee}</p>
                      <p className="text-xs text-slate-600">{reference.role} · {reference.company} · {reference.relationshipType}</p>
                    </div>
                    <p className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">${reference.priceCredits}</p>
                  </div>
                  <p className="mt-2 text-sm text-slate-700">{reference.previewSummary}</p>
                  <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-4">
                    <p>Trust {reference.trustScore}</p>
                    <p>Used by {reference.usedByCount} companies</p>
                    <p>Freshly updated {reference.freshnessDays}d ago</p>
                    <p>Usefulness {avgRating(reference.reviews).toFixed(1)} / 5</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => buyReference(reference)} disabled={purchased || ledger.walletCredits < reference.priceCredits} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                      {purchased ? "Purchased" : "Buy now"}
                    </button>
                    <button type="button" onClick={() => toggleWatchlist(reference.id)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">
                      {watched ? "Saved" : "Save for later"}
                    </button>
                  </div>

                  {purchased ? (
                    <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Unlocked full package</p>
                      <p className="mt-1 text-sm text-slate-800">{reference.fullReference}</p>
                      <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                        <p>Trust score: <span className="font-semibold">{reference.trustScore}</span></p>
                        <p>Freshness date: <span className="font-semibold">{new Date(Date.now() - reference.freshnessDays * 86400000).toLocaleDateString()}</span></p>
                        <p>Relationship type: <span className="font-semibold">{reference.relationshipType}</span></p>
                        <p>Manager notes: <span className="font-semibold">{reference.managerNotes || "None"}</span></p>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {reference.kpis.map((kpi) => (
                          <p key={kpi.label} className="rounded-lg bg-white px-2 py-1 text-xs text-slate-700">{kpi.label}: <span className="font-semibold">{kpi.score}/5</span></p>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Download PDF (mock)</button>
                        <button type="button" onClick={() => navigator.clipboard.writeText(reference.fullReference)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">Copy summary</button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Purchase History</h3>
            <div className="mt-3 space-y-2">
              {ledger.transactions.length ? ledger.transactions.map((tx) => (
                <div key={tx.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">{tx.referee} · ${tx.amountCredits}</p>
                  <p className="text-xs text-slate-600">{new Date(tx.createdAt).toLocaleString()} · {tx.role}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">Re-open access</button>
                    <button type="button" className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white">Reorder</button>
                  </div>
                </div>
              )) : <p className="text-sm text-slate-500">No purchases yet.</p>}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Saved Watchlist</h3>
            <ul className="mt-3 space-y-2">
              {marketplaceReferences.filter((reference) => ledger.watchlist.includes(reference.id)).map((reference) => (
                <li key={reference.id} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{reference.referee}</p>
                  <p className="text-xs text-slate-600">{reference.role} · ${reference.priceCredits}</p>
                </li>
              ))}
              {!ledger.watchlist.length ? <li className="text-sm text-slate-500">No saved profiles yet.</li> : null}
            </ul>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Featured Top Referees</h3>
            <ul className="mt-3 space-y-2">
              {featured.map((referee) => (
                <li key={referee.id} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-sm font-semibold text-slate-900">{referee.referee}</p>
                  <p className="text-xs text-slate-600">{referee.role} · Trust {referee.trustScore} · Verified professional signal</p>
                </li>
              ))}
            </ul>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Unlocked References</h3>
            <div className="mt-3 space-y-2">
              {purchasedReferences.length ? purchasedReferences.map((item) => (
                <p key={item.id} className="rounded-lg bg-teal-50 px-3 py-2 text-sm text-teal-900">{item.referee} · {item.role}</p>
              )) : <p className="text-sm text-slate-500">Unlock references to view them here.</p>}
            </div>
          </article>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/v2/onboarding?type=company" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Edit onboarding answers</Link>
          <Link href="/landing/index.html" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Return to landing</Link>
        </div>
      </div>
    </V2Shell>
  );
}
