"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReferenceRequestsTable, { type ReferenceRequestRow } from "@/components/v2/ReferenceRequestsTable";
import V2Shell from "@/components/v2/V2Shell";
import {
  getCurrentCandidateProfile,
  getProfileCompletion,
  requireAuthenticatedCandidateUserId,
} from "@/lib/profile/candidate-profile-service";
import type { CandidateProfileRecord } from "@/lib/storage/storage-provider";

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
  const router = useRouter();
  const [profile, setProfile] = useState<CandidateProfileRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const userId = await requireAuthenticatedCandidateUserId();
        const currentProfile = await getCurrentCandidateProfile(userId);

        if (!mounted) return;
        setProfile(currentProfile);
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

  const completion = getProfileCompletion(profile);
  const welcomeName = profile?.full_name?.trim() || "Candidate";

  return (
    <V2Shell
      active="candidate-dashboard"
      userType="candidate"
      title="Candidate dashboard"
      subtitle="Monitor profile progress and track incoming reference activity."
    >
      <div className="space-y-6">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--teal-soft)] p-4">
          <p className="text-sm text-[var(--foreground)]">Welcome, {welcomeName}</p>
          <p className="mt-1 text-sm text-slate-700">Current Role: {profile?.title?.trim() || "Not provided"}</p>
          <p className="text-sm text-slate-700">Company: {profile?.company?.trim() || "Not provided"}</p>
          <p className="text-sm text-slate-700">CV Uploaded: {profile?.cv_url ? "Yes" : "No"}</p>
          <p className="text-sm font-semibold text-[var(--teal-primary)]">Profile Completion: {completion}%</p>

          {isLoading ? <p className="mt-2 text-xs text-slate-600">Loading profile...</p> : null}
          {errorMessage ? (
            <p className="mt-2 text-xs text-red-600" role="alert" aria-live="polite">
              {errorMessage}
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Profile completion", `${completion}%`],
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

        <p className="text-xs text-slate-500">TODO: Replace mock requests with real reference workflow data.</p>

        <div className="flex flex-wrap gap-3">
          <Link
            href="/v2/onboarding?type=candidate"
            className="rounded-[var(--radius)] bg-[var(--teal-primary)] px-4 py-2 text-sm font-semibold text-white"
          >
            Edit onboarding answers
          </Link>
          <Link
            href="/landing/index.html"
            className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-700"
          >
            Return to landing
          </Link>
        </div>
      </div>
    </V2Shell>
  );
}
