"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import V2Shell from "@/components/v2/V2Shell";
import { supabase } from "@/lib/supabaseClient";
import { requireAuthenticatedCandidateUserId } from "@/lib/profile/candidate-profile-service";
import {
  createReferenceRequest,
  fetchCandidateReferenceRequests,
  type CandidateReferenceRequest,
  type ReferenceRequestLifecycleStatus,
} from "@/lib/v2/reference-requests-service";

const statusStyle: Record<ReferenceRequestLifecycleStatus, string> = {
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  started: "bg-cyan-50 text-cyan-700 border-cyan-200",
  opened: "bg-sky-50 text-sky-700 border-sky-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  expired: "bg-rose-50 text-rose-700 border-rose-200",
};

function formatRelative(iso: string | null | undefined) {
  if (!iso) return "—";
  const delta = Date.now() - new Date(iso).getTime();
  const hours = Math.max(0, Math.floor(delta / (1000 * 60 * 60)));
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function statusLabel(status: ReferenceRequestLifecycleStatus) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function CandidateRequestsCenterPage() {
  const router = useRouter();
  const [candidateId, setCandidateId] = useState("");
  const [rows, setRows] = useState<CandidateReferenceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (candidateUserId: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchCandidateReferenceRequests(candidateUserId);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load request center.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const userId = await requireAuthenticatedCandidateUserId();
        if (!mounted) return;
        setCandidateId(userId);
        await load(userId);
      } catch (err) {
        if (!mounted) return;
        if (err instanceof Error && err.message === "AUTH_REQUIRED") {
          router.replace("/v2/auth?type=candidate");
          return;
        }
        setError(err instanceof Error ? err.message : "Unable to load request center.");
        setLoading(false);
      }
    };

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [router]);

  const metrics = useMemo(() => {
    const sent = rows.length;
    const completed = rows.filter((row) => row.status === "completed").length;
    const pending = rows.filter((row) => ["pending", "opened", "started"].includes(row.status)).length;
    const progress = sent ? Math.round((completed / sent) * 100) : 0;
    return { sent, completed, pending, progress };
  }, [rows]);

  const resendInvite = async (request: CandidateReferenceRequest) => {
    if (!candidateId) return;
    setBusyId(request.id);
    setError("");
    try {
      await createReferenceRequest({
        candidateId,
        refereeName: request.refereeName,
        refereeEmail: request.refereeEmail,
        relationship: request.relationship,
        companyWorkedTogether: request.company,
        profileExperienceId: undefined,
      });
      await load(candidateId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to resend invite.");
    } finally {
      setBusyId(null);
    }
  };

  const cancelPending = async (request: CandidateReferenceRequest) => {
    setBusyId(request.id);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("reference_invites")
        .update({ status: "cancelled", expired_at: new Date().toISOString() })
        .eq("id", request.id)
        .eq("requester_id", candidateId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setRows((current) =>
        current.map((row) =>
          row.id === request.id
            ? {
                ...row,
                status: "expired",
                expiredAt: new Date().toISOString(),
              }
            : row
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to cancel request.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <V2Shell
      active="candidate-dashboard"
      userType="candidate"
      title="Reference Requests"
      subtitle="Track progress and grow your verified reputation."
    >
      <div className="mx-auto max-w-2xl space-y-5">
        <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-5 text-white shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200">Reference Requests</p>
          <h2 className="mt-2 text-2xl font-semibold">Track progress and grow your verified reputation.</h2>

          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Metric label="Sent" value={metrics.sent} />
            <Metric label="Completed" value={metrics.completed} />
            <Metric label="Pending" value={metrics.pending} />
          </div>

          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-xs text-teal-100">
              <span>{metrics.progress}% complete</span>
              <span>{metrics.completed}/{Math.max(metrics.sent, 1)} completed</span>
            </div>
            <div className="h-2 rounded-full bg-slate-700">
              <div className="h-2 rounded-full bg-teal-400 transition-all" style={{ width: `${metrics.progress}%` }} />
            </div>
          </div>

          <Link
            href="/v2/candidate/references/request"
            className="mt-4 inline-flex rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950"
          >
            + Request More
          </Link>
        </section>

        {error ? <p className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
        {loading ? <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading requests...</p> : null}

        {!loading && rows.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <h3 className="text-lg font-semibold text-slate-900">No reference requests yet</h3>
            <p className="mt-2 text-sm text-slate-600">Start collecting verified professional proof.</p>
            <Link
              href="/v2/candidate/references/request"
              className="mt-4 inline-flex rounded-xl bg-[var(--teal-primary)] px-4 py-2 text-sm font-semibold text-white"
            >
              Request Reference
            </Link>
          </section>
        ) : null}

        {!loading ? (
          <section className="space-y-3">
            {rows.map((request) => {
              const hasCelebration = request.status === "completed";
              const isPendingOnly = request.status === "pending";

              return (
                <article key={request.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{request.refereeName}</p>
                      <p className="text-xs text-slate-500">{request.relationship} at {request.company}</p>
                    </div>
                    <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusStyle[request.status]}`}>
                      {statusLabel(request.status)}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-1 gap-y-1 text-sm text-slate-700">
                    <div className="flex gap-2"><dt className="font-medium text-slate-500">For:</dt><dd>{request.role}</dd></div>
                    <div className="flex gap-2"><dt className="font-medium text-slate-500">Relationship:</dt><dd>{request.relationship}</dd></div>
                    <div className="flex gap-2"><dt className="font-medium text-slate-500">Sent:</dt><dd>{formatRelative(request.sentAt)}</dd></div>
                    {request.status === "opened" ? (
                      <div className="text-xs font-medium text-sky-700">Viewed {formatRelative(request.openedAt)}</div>
                    ) : null}
                  </dl>

                  {hasCelebration ? (
                    <p className="mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      +1 Verified Reference Added
                    </p>
                  ) : null}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {request.status === "opened" ? (
                      <a
                        href={`mailto:${encodeURIComponent(request.refereeEmail)}?subject=${encodeURIComponent("Reminder: your HRKey reference is waiting")}`}
                        className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        Send Reminder
                      </a>
                    ) : null}

                    {request.status === "expired" ? (
                      <button
                        type="button"
                        disabled={busyId === request.id}
                        onClick={() => resendInvite(request)}
                        className="rounded-xl bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950 disabled:opacity-60"
                      >
                        {busyId === request.id ? "Resending..." : "Resend Invite"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === request.id}
                        onClick={() => resendInvite(request)}
                        className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-60"
                      >
                        {busyId === request.id ? "Resending..." : "Resend"}
                      </button>
                    )}

                    {request.referenceLink ? (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(request.referenceLink || "")}
                        className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        Copy Link
                      </button>
                    ) : null}

                    {isPendingOnly ? (
                      <button
                        type="button"
                        disabled={busyId === request.id}
                        onClick={() => cancelPending(request)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    ) : null}

                    {hasCelebration ? (
                      <Link href={`/v2/candidate/references/${request.id}`} className="rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                        View Feedback
                      </Link>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </section>
        ) : null}

        <section className="rounded-3xl border border-slate-200 bg-gradient-to-b from-teal-50 to-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">Why references matter</h3>
          <p className="mt-1 text-xs text-slate-600">Each completed reference increases:</p>
          <ul className="mt-3 space-y-1 text-sm text-slate-700">
            <li>• Confidence score</li>
            <li>• Hiring trust</li>
            <li>• Public profile strength</li>
            <li>• Recruiter conversion</li>
          </ul>
        </section>
      </div>
    </V2Shell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-700/80 bg-slate-800/80 p-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-300">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
