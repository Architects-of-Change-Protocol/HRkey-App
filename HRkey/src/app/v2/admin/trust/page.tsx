"use client";

import { useEffect, useMemo, useState } from "react";
import V2Shell from "@/components/v2/V2Shell";
import {
  getTrustModerationQueue,
  moderateTrust,
  recalculateTrustScore,
  type TrustModerationQueueItem,
} from "@/lib/v2/trust-dashboard-service";

export default function AdminTrustModerationPage() {
  const [queue, setQueue] = useState<TrustModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyReferee, setBusyReferee] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selectedRefereeId, setSelectedRefereeId] = useState("");
  const [overrideScore, setOverrideScore] = useState("75");
  const [reason, setReason] = useState("Manual trust moderation");

  const hydrateQueue = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const data = await getTrustModerationQueue();
      setQueue(data);
      if (!selectedRefereeId && data[0]?.referee_id) {
        setSelectedRefereeId(data[0].referee_id);
      }
    } catch (error: any) {
      console.error("[v2 admin trust] queue hydration failed", error);
      setErrorMessage(error?.message || "Failed to load moderation queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    hydrateQueue();
  }, []);

  const riskQueue = useMemo(() => {
    return [...queue].sort((a, b) => {
      const scoreA = a.open_disputes * 3 + a.refunds * 2 + a.low_reviews;
      const scoreB = b.open_disputes * 3 + b.refunds * 2 + b.low_reviews;
      return scoreB - scoreA;
    });
  }, [queue]);

  const runRecalculate = async (refereeId: string) => {
    try {
      setBusyReferee(refereeId);
      setNotice(null);
      await recalculateTrustScore(refereeId);
      setNotice(`Recalculated trust score for ${refereeId}.`);
      await hydrateQueue();
    } catch (error: any) {
      setErrorMessage(error?.message || "Recalculation failed.");
    } finally {
      setBusyReferee(null);
    }
  };

  const runOverride = async () => {
    if (!selectedRefereeId) return;

    try {
      setBusyReferee(selectedRefereeId);
      setNotice(null);
      await moderateTrust(selectedRefereeId, "override_score", reason, { score: Number(overrideScore) });
      setNotice(`Override applied for ${selectedRefereeId}.`);
      await hydrateQueue();
    } catch (error: any) {
      setErrorMessage(error?.message || "Override action failed.");
    } finally {
      setBusyReferee(null);
    }
  };

  return (
    <V2Shell
      active="admin-trust"
      userType="admin"
      title="Trust Moderation Panel"
      subtitle="Review trust anomalies, recalculate scores, and apply controlled admin overrides."
    >
      <div className="space-y-5">
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Moderation Queue</h2>
            <button
              type="button"
              onClick={hydrateQueue}
              className="rounded-lg border border-cyan-200 px-3 py-1.5 text-xs font-semibold text-cyan-700"
            >
              Refresh Queue
            </button>
          </div>
          {errorMessage ? <p className="mt-3 text-sm text-rose-600">{errorMessage}</p> : null}
          {notice ? <p className="mt-3 text-sm text-emerald-600">{notice}</p> : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2">Referee</th>
                  <th className="px-2 py-2">Trust</th>
                  <th className="px-2 py-2">Tier</th>
                  <th className="px-2 py-2">Open Disputes</th>
                  <th className="px-2 py-2">Refunds</th>
                  <th className="px-2 py-2">Low Reviews</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-2 py-4 text-slate-500" colSpan={7}>Loading moderation queue…</td>
                  </tr>
                ) : riskQueue.length === 0 ? (
                  <tr>
                    <td className="px-2 py-4 text-slate-500" colSpan={7}>No trust anomalies right now.</td>
                  </tr>
                ) : (
                  riskQueue.map((item) => (
                    <tr key={item.referee_id} className="border-b border-slate-100">
                      <td className="px-2 py-2 font-mono text-xs text-slate-700">{item.referee_id}</td>
                      <td className="px-2 py-2 font-semibold text-slate-900">{Math.round(item.current_trust_score || 0)}</td>
                      <td className="px-2 py-2 capitalize">{item.trust_tier}</td>
                      <td className="px-2 py-2">{item.open_disputes}</td>
                      <td className="px-2 py-2">{item.refunds}</td>
                      <td className="px-2 py-2">{item.low_reviews}</td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          disabled={busyReferee === item.referee_id}
                          onClick={() => runRecalculate(item.referee_id)}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-60"
                        >
                          {busyReferee === item.referee_id ? "Working..." : "Recalculate"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-base font-semibold text-slate-900">Manual Override</h3>
          <p className="mt-1 text-xs text-slate-600">Use only with audit-ready reasons. This writes to trust moderation history.</p>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <input
              value={selectedRefereeId}
              onChange={(event) => setSelectedRefereeId(event.target.value)}
              placeholder="Referee UUID"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <input
              value={overrideScore}
              onChange={(event) => setOverrideScore(event.target.value)}
              placeholder="Score (0-100)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={runOverride}
              disabled={!selectedRefereeId || busyReferee === selectedRefereeId}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Apply Override
            </button>
          </div>
        </section>
      </div>
    </V2Shell>
  );
}
