"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import V2Shell from "@/components/v2/V2Shell";
import { loadCompanyLedger, type MarketplaceTransaction } from "@/lib/v2/marketplace-engine";
import { supabase } from "@/lib/supabaseClient";
import { getRefereeDashboardMetrics, recalculateTrustScore, type RefereeDashboardMetrics } from "@/lib/v2/trust-dashboard-service";

const givenReferences = [
  { id: "r-1", candidate: "Maya Chen", role: "Senior Product Manager", date: "Apr 22, 2026", score: "4.9" },
  { id: "r-2", candidate: "James Okafor", role: "Engineering Manager", date: "Apr 17, 2026", score: "4.8" },
  { id: "r-3", candidate: "Elena Torres", role: "Revenue Operations Lead", date: "Apr 8, 2026", score: "4.7" },
] as const;

const pendingRequests = [
  { candidate: "Noah Patel", role: "Staff Software Engineer", company: "Lattice", age: "2h ago" },
  { candidate: "Sofia Kim", role: "Senior Data Analyst", company: "Atlassian", age: "Yesterday" },
] as const;

const roleBadges = ["People Manager", "Hiring Panel Lead", "Reference Top Contributor"] as const;
const referenceViews: Record<string, number> = {
  "Angela Ruiz": 30,
  "Rahul Menon": 22,
  "Marta Klein": 16,
  "Ethan Brooks": 10,
};

export default function RefereeDashboardV2Page() {
  const [transactions, setTransactions] = useState<MarketplaceTransaction[]>([]);
  const [trustMetrics, setTrustMetrics] = useState<RefereeDashboardMetrics | null>(null);
  const [trustLoading, setTrustLoading] = useState(true);

  useEffect(() => {
    const ledger = loadCompanyLedger();
    setTransactions(ledger.transactions);
  }, []);

  useEffect(() => {
    let mounted = true;
    const hydrateTrust = async () => {
      try {
        const { data } = await supabase.auth.getUser();
        const userId = data.user?.id;
        if (!userId) return;
        await recalculateTrustScore(userId);
        const metrics = await getRefereeDashboardMetrics(userId);
        if (!mounted) return;
        setTrustMetrics(metrics);
      } catch (error) {
        console.error("[v2 referee dashboard] trust hydration failed", error);
      } finally {
        if (mounted) setTrustLoading(false);
      }
    };
    hydrateTrust();
    return () => {
      mounted = false;
    };
  }, []);

  const lifetimeEarnings = useMemo(
    () => transactions.reduce((sum, tx) => sum + tx.refereePayoutCredits, 0),
    [transactions],
  );
  const pendingPayouts = Number((lifetimeEarnings * 0.2).toFixed(2));

  const topPerforming = useMemo(() => {
    const grouped = transactions.reduce<Record<string, { purchases: number; earnings: number }>>((acc, tx) => {
      const row = acc[tx.referee] || { purchases: 0, earnings: 0 };
      row.purchases += 1;
      row.earnings += tx.refereePayoutCredits;
      acc[tx.referee] = row;
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([referee, stats]) => ({
        referee,
        purchases: stats.purchases,
        earnings: stats.earnings,
        views: referenceViews[referee] || 0,
      }))
      .sort((a, b) => b.earnings - a.earnings)
      .slice(0, 3);
  }, [transactions]);

  const conversionRate = useMemo(() => {
    const purchases = transactions.length;
    const views = Object.values(referenceViews).reduce((sum, value) => sum + value, 0);
    if (!views) return 0;
    return (purchases / views) * 100;
  }, [transactions]);

  const trustScore = Math.round(trustMetrics?.trust_score || 0);
  const trendDirection = (trustMetrics?.growth_last_30d || 0) >= 0 ? "▲" : "▼";
  const trendColor = (trustMetrics?.growth_last_30d || 0) >= 0 ? "text-emerald-500" : "text-rose-500";
  const scoreRing = `conic-gradient(#14b8a6 ${trustScore * 3.6}deg, #1e293b ${trustScore * 3.6}deg)`;
  const freshnessLabel = givenReferences[0]?.date || "No references yet";
  const badgePills = trustMetrics?.badges?.length ? trustMetrics.badges : [...roleBadges];

  return (
    <V2Shell
      active="referee-dashboard"
      userType="referee"
      title="Referee Earnings Center"
      subtitle="Track earnings from your verified reputation and optimize reusable reference performance."
    >
      <div className="space-y-5 pb-20">
        <section className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-white shadow-xl sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-teal-300">HRKey Referee Pro</p>
              <h2 className="mt-1 text-xl font-bold">Monetize your verified professional signal.</h2>
            </div>
            <Link href="/v2/onboarding/details" className="rounded-lg border border-teal-300/40 bg-teal-500/10 px-3 py-2 text-xs font-semibold text-teal-100">
              Complete Profile
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
              { label: "Lifetime Earnings", value: `$${lifetimeEarnings.toFixed(2)}`, detail: "70% referee split" },
              { label: "Pending Payouts", value: `$${pendingPayouts.toFixed(2)}`, detail: "Queued for payout" },
              { label: "Transactions", value: String(trustMetrics?.purchases_generated ?? transactions.length), detail: "Reusable reference sales" },
              { label: "Conversion", value: `${conversionRate.toFixed(1)}%`, detail: "Viewed vs purchased" },
              { label: "Trust Score", value: String(trustScore), detail: trustLoading ? "Calculating..." : `${trendDirection} ${Math.abs(trustMetrics?.growth_last_30d || 0).toFixed(1)} last 30d` },
            ].map((stat) => (
              <article key={stat.label} className="rounded-xl border border-slate-800 bg-slate-900 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{stat.label}</p>
                <p className="mt-2 text-lg font-bold text-white">{stat.value}</p>
                <p className="text-xs text-teal-200/80">{stat.detail}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Earnings Transactions</h3>
            <div className="mt-3 space-y-2">
              {transactions.length ? (
                transactions.map((tx) => (
                  <div key={tx.id} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-900">{tx.referee} · +${tx.refereePayoutCredits.toFixed(2)}</p>
                    <p className="text-xs text-slate-600">{new Date(tx.createdAt).toLocaleString()} · {tx.role} at {tx.company}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No earnings yet. Purchases will appear here automatically.</p>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold text-slate-900">Top Performing References</h3>
            <div className="mt-3 space-y-2">
              {topPerforming.length ? (
                topPerforming.map((item) => (
                  <div key={item.referee} className="rounded-xl bg-slate-50 p-3">
                    <p className="text-sm font-semibold text-slate-900">{item.referee}</p>
                    <p className="text-xs text-slate-600">Purchases: {item.purchases} · Views: {item.views} · Earned ${item.earnings.toFixed(2)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">No top references yet.</p>
              )}
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-slate-900">My References Given</h3>
              <input type="search" placeholder="Search by candidate or role" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none ring-teal-200 focus:ring sm:w-56" />
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
              <h3 className="text-base font-semibold text-slate-900">Profile Credibility</h3>
              <div className="mt-3 flex items-center gap-4">
                <div className="relative h-20 w-20 rounded-full p-1" style={{ background: scoreRing }}>
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-950 text-white">
                    <span className="text-lg font-bold">{trustScore}</span>
                  </div>
                </div>
                <div>
                  <p className={`text-sm font-semibold ${trendColor}`}>{trendDirection} {Math.abs(trustMetrics?.growth_last_30d || 0).toFixed(1)} growth</p>
                  <p className="text-xs text-slate-600" title="Trust combines completion volume, usefulness ratings, repeat buyers, profile quality, verification, and response speed; penalties apply for stale references, disputes, refunds, and poor ratings.">
                    Why this score?
                  </p>
                  <p className="text-xs text-slate-500">Freshness indicator: latest update {freshnessLabel}</p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {badgePills.map((badge) => (
                  <span key={badge} className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">{badge}</span>
                ))}
              </div>
              <p className="mt-3 text-xs text-slate-600">References completed: {trustMetrics?.references_completed ?? 0} · Repeat buyers: {trustMetrics?.repeat_buyers ?? 0}.</p>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">Pending Requests</h3>
              <div className="mt-3 space-y-2">
                {pendingRequests.map((request) => (
                  <article key={`${request.candidate}-${request.role}`} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-900">{request.candidate}</p>
                    <p className="text-xs text-slate-600">{request.role} · {request.company} · {request.age}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </V2Shell>
  );
}
