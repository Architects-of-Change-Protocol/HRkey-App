"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import V2Shell from "@/components/v2/V2Shell";
import {
  getCurrentCandidateProfile,
  requireAuthenticatedCandidateUserId,
} from "@/lib/profile/candidate-profile-service";
import type { CandidateProfileRecord } from "@/lib/storage/storage-provider";
import {
  fetchCandidateReferenceRequests,
  type CandidateReferenceRequest,
} from "@/lib/v2/reference-requests-service";

type SubmittedReferenceCard = {
  id: string;
  role: string;
  company: string;
  rating: number | null;
  summary: string;
  createdAt: string | null;
  detailHref: string;
};

type ProfileDetails = {
  skills: string[];
  languages: string[];
  certifications: string[];
};

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function pickProfileDetails(profile: CandidateProfileRecord | null): ProfileDetails {
  const detailsSource = profile?.onboarding_details || profile?.profile_meta || profile?.metadata || {};

  return {
    skills: normalizeStringArray((detailsSource as Record<string, unknown>).skills),
    languages: normalizeStringArray((detailsSource as Record<string, unknown>).languages),
    certifications: normalizeStringArray((detailsSource as Record<string, unknown>).certifications),
  };
}

function deriveStrengths(references: SubmittedReferenceCard[], skills: string[]): string[] {
  const strengths = new Set<string>(skills.slice(0, 4));

  references.forEach((reference) => {
    if (reference.rating !== null && reference.rating >= 4.5) {
      strengths.add("Consistently high impact");
    }

    const summary = reference.summary.toLowerCase();
    if (summary.includes("lead")) strengths.add("Leadership");
    if (summary.includes("communic")) strengths.add("Communication");
    if (summary.includes("collabor")) strengths.add("Cross-functional collaboration");
    if (summary.includes("deliver") || summary.includes("execution")) strengths.add("Execution");
  });

  return Array.from(strengths).slice(0, 6);
}

function formatAge(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const days = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month" : `${months} months`;
}

async function fetchSubmittedReferences(candidateId: string): Promise<SubmittedReferenceCard[]> {
  const { data, error } = await supabase
    .from("references")
    .select("id, owner_id, role, company, summary, overall_rating, status, created_at")
    .eq("owner_id", candidateId)
    .order("created_at", { ascending: false })
    .limit(12);

  if (error) {
    console.error("[v2 dashboard] failed to fetch submitted references", error);
    return [];
  }

  return ((data || []) as Array<Record<string, unknown>>).map((row) => {
    const ratingValue = typeof row.overall_rating === "number" ? row.overall_rating : Number(row.overall_rating);
    const numericRating = Number.isFinite(ratingValue) ? Number(ratingValue) : null;

    return {
      id: String(row.id || crypto.randomUUID()),
      role: typeof row.role === "string" && row.role.trim() ? row.role : "Reference",
      company: typeof row.company === "string" && row.company.trim() ? row.company : "Not specified",
      rating: numericRating,
      summary: typeof row.summary === "string" && row.summary.trim() ? row.summary : "No summary provided yet.",
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
      detailHref: `/v2/candidate/references/${String(row.id || "detail")}`,
    };
  });
}

export default function CandidateDashboardV2Page() {
  const router = useRouter();
  const [profile, setProfile] = useState<CandidateProfileRecord | null>(null);
  const [submittedReferences, setSubmittedReferences] = useState<SubmittedReferenceCard[]>([]);
  const [pendingRequests, setPendingRequests] = useState<CandidateReferenceRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const userId = await requireAuthenticatedCandidateUserId();

        const [currentProfile, requestRows, referenceRows] = await Promise.all([
          getCurrentCandidateProfile(userId),
          fetchCandidateReferenceRequests(userId),
          fetchSubmittedReferences(userId),
        ]);

        if (!mounted) return;
        setProfile(currentProfile);
        setSubmittedReferences(referenceRows);
        setPendingRequests(requestRows.filter((row) => ["pending", "opened", "started"].includes(row.status)));
      } catch (error) {
        if (!mounted) return;

        if (error instanceof Error && error.message === "AUTH_REQUIRED") {
          router.replace("/v2/auth?type=candidate");
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Failed to load dashboard profile.");
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, [router]);

  const details = useMemo(() => pickProfileDetails(profile), [profile]);
  const strengths = useMemo(() => deriveStrengths(submittedReferences, details.skills), [submittedReferences, details.skills]);
  const fullName = profile?.full_name?.trim() || "Candidate";
  const title = profile?.title?.trim() || "Title not added yet";
  const company = profile?.company?.trim() || "Company not added yet";

  return (
    <V2Shell
      active="candidate-dashboard"
      userType="candidate"
      title="Candidate dashboard"
      subtitle="Your references, profile strengths, and pending actions in one place."
    >
      <div className="space-y-5">
        <header className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-white p-3 shadow-sm">
          <Link href="/" className="flex items-center gap-2">
            <div className="rounded-lg bg-[var(--teal-primary)] px-2 py-1 text-xs font-bold text-white">HRKey</div>
            <span className="text-sm font-semibold text-slate-900">Candidate Hub</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/v2/candidate/references/request"
              className="rounded-lg bg-[var(--teal-primary)] px-3 py-2 text-xs font-semibold text-white"
            >
              Request Reference
            </Link>
            <button type="button" className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2 py-2 text-xs text-slate-700">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--teal-soft)] font-semibold text-[var(--teal-primary)]">
                {fullName.slice(0, 1).toUpperCase()}
              </span>
              Profile
            </button>
          </div>
        </header>

        <section className="rounded-2xl border border-[var(--border)] bg-gradient-to-r from-[var(--teal-soft)] to-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--teal-primary)]">Candidate Hero Card</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">{fullName}</h2>
          <p className="text-sm text-slate-700">{title}</p>
          <p className="text-sm text-slate-600">{company}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="References available" value={String(submittedReferences.length)} />
            <StatCard label="Pending requests" value={String(pendingRequests.length)} />
            <StatCard label="Languages" value={String(details.languages.length)} />
            <StatCard label="Skills" value={String(details.skills.length)} />
          </div>

          {errorMessage ? <p className="mt-3 text-xs text-red-600">{errorMessage}</p> : null}
          {isLoading ? <p className="mt-3 text-xs text-slate-500">Loading your dashboard...</p> : null}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Your References</h3>
            <Link href="/candidate/evaluation" className="text-xs font-semibold text-[var(--teal-primary)]">View all</Link>
          </div>

          {submittedReferences.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-5 text-center">
              <p className="text-sm text-slate-700">Your first reference can unlock new opportunities.</p>
              <Link
                href="/v2/candidate/references/request"
                className="mt-3 inline-flex rounded-lg bg-[var(--teal-primary)] px-4 py-2 text-sm font-semibold text-white"
              >
                Request Reference
              </Link>
            </div>
          ) : (
            <div className="grid gap-3">
              {submittedReferences.map((reference) => (
                <article key={reference.id} className="rounded-xl border border-[var(--border)] bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{reference.role}</p>
                      <p className="text-xs text-slate-600">{reference.company}</p>
                    </div>
                    <p className="rounded-full bg-[var(--teal-soft)] px-2 py-1 text-xs font-semibold text-[var(--teal-primary)]">
                      {reference.rating ? `${reference.rating.toFixed(1)} / 5` : "No rating"}
                    </p>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">{reference.summary.slice(0, 160)}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                    <span>{reference.createdAt ? new Date(reference.createdAt).toLocaleDateString() : "No date"}</span>
                    <Link href={reference.detailHref} className="font-semibold text-[var(--teal-primary)]">
                      View details
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Pending Requests</h3>
          {pendingRequests.length === 0 ? (
            <div className="rounded-xl border border-[var(--border)] bg-white p-4 text-sm text-slate-600">
              No pending requests right now.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <article key={request.id} className="rounded-xl border border-[var(--border)] bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{request.company || request.refereeName}</p>
                      <p className="text-xs text-slate-600">Purpose: {request.role || request.relationship}</p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">{request.status.charAt(0).toUpperCase() + request.status.slice(1)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Age: {formatAge(request.requestedAt)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {request.referenceLink ? (
                      <a
                        href={request.referenceLink}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        Respond
                      </a>
                    ) : null}
                    <a
                      href={`mailto:${encodeURIComponent(request.refereeEmail)}?subject=${encodeURIComponent("Friendly reminder: HRKey reference request")}`}
                      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                      Resend
                    </a>
                    {request.referenceLink ? (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(request.referenceLink || "")}
                        className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-slate-700"
                      >
                        Copy link
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-4">
          <h3 className="text-lg font-semibold text-slate-900">Profile</h3>
          <ProfileTags label="Skills" values={details.skills} />
          <ProfileTags label="Languages" values={details.languages} />
          <ProfileTags label="Certifications" values={details.certifications} />
          <ProfileTags label="Areas of strength" values={strengths} />
        </section>
      </div>
    </V2Shell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ProfileTags({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      {values.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">No data yet.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {values.map((value) => (
            <span key={`${label}-${value}`} className="rounded-full bg-[var(--teal-soft)] px-3 py-1 text-xs font-medium text-slate-700">
              {value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
