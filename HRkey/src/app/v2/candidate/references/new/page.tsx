"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import V2Shell from "@/components/v2/V2Shell";
import { supabase } from "@/lib/supabaseClient";
import { requireAuthenticatedCandidateUserId } from "@/lib/profile/candidate-profile-service";
import { createReferenceRequest } from "@/lib/v2/reference-requests-service";

type ProfileExperienceRow = {
  id: string;
  title: string | null;
  company: string | null;
};

const RELATIONSHIP_OPTIONS = [
  "Manager",
  "Peer",
  "Direct report",
  "Client",
  "Mentor",
  "Other",
];

export default function NewReferenceRequestPage() {
  const router = useRouter();
  const [candidateId, setCandidateId] = useState("");
  const [experiences, setExperiences] = useState<ProfileExperienceRow[]>([]);
  const [refereeName, setRefereeName] = useState("");
  const [refereeEmail, setRefereeEmail] = useState("");
  const [relationship, setRelationship] = useState("Manager");
  const [companyWorkedTogether, setCompanyWorkedTogether] = useState("");
  const [optionalMessage, setOptionalMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successState, setSuccessState] = useState<{ referenceId: string | null; referenceLink: string | null } | null>(null);

  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      try {
        const userId = await requireAuthenticatedCandidateUserId();
        if (!mounted) return;
        setCandidateId(userId);

        const { data } = await supabase
          .from("profile_experiences")
          .select("id, title, company")
          .eq("profile_id", userId)
          .order("sort_order", { ascending: true });

        if (!mounted) return;

        const experienceRows = (data || []) as ProfileExperienceRow[];
        setExperiences(experienceRows);
        if (!companyWorkedTogether && experienceRows[0]?.company) {
          setCompanyWorkedTogether(experienceRows[0].company);
        }
      } catch (error) {
        if (error instanceof Error && error.message === "AUTH_REQUIRED") {
          router.replace("/v2/auth?type=candidate");
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : "Unable to load candidate context.");
      }
    };

    bootstrap();

    return () => {
      mounted = false;
    };
  }, [router]);

  const selectedExperienceId = useMemo(() => experiences[0]?.id, [experiences]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!candidateId) {
      setErrorMessage("Please sign in before sending a reference request.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const result = await createReferenceRequest({
        candidateId,
        refereeName,
        refereeEmail,
        relationship,
        companyWorkedTogether,
        optionalMessage,
        profileExperienceId: selectedExperienceId,
      });

      if (!result.ok) {
        setErrorMessage("We could not create this reference request right now.");
        return;
      }

      setSuccessState({
        referenceId: result.referenceId,
        referenceLink: result.referenceLink,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create reference request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <V2Shell
      active="candidate-dashboard"
      userType="candidate"
      title="Request new reference"
      subtitle="Reuse the existing HRKey invite engine through the V2 experience."
    >
      <div className="mx-auto max-w-2xl space-y-6">
        {!successState ? (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-white p-6">
            <label className="block text-sm font-medium text-slate-700">
              Referee full name
              <input
                required
                value={refereeName}
                onChange={(event) => setRefereeName(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2"
                placeholder="Alex Rivera"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Referee email
              <input
                required
                type="email"
                value={refereeEmail}
                onChange={(event) => setRefereeEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2"
                placeholder="alex@company.com"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Relationship type
              <select
                value={relationship}
                onChange={(event) => setRelationship(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2"
              >
                {RELATIONSHIP_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Company worked together
              <input
                required
                value={companyWorkedTogether}
                onChange={(event) => setCompanyWorkedTogether(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2"
                placeholder="Northstar Labs"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Optional message
              <textarea
                value={optionalMessage}
                onChange={(event) => setOptionalMessage(event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2"
                placeholder="Thanks for helping with my HRKey profile..."
              />
            </label>

            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-[var(--radius)] bg-[var(--teal-primary)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-70"
              >
                {isSubmitting ? "Sending request..." : "Send reference request"}
              </button>
              <Link
                href="/v2/candidate/dashboard"
                className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-700"
              >
                Cancel
              </Link>
            </div>
          </form>
        ) : (
          <section className="space-y-4 rounded-[var(--radius)] border border-[var(--border)] bg-white p-6">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Reference request sent</h2>
            <p className="text-sm text-slate-700">
              Your request has been created with the existing HRKey reference workflow.
            </p>

            {successState.referenceId ? (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">Request ID: {successState.referenceId}</p>
            ) : null}

            {successState.referenceLink ? (
              <p className="rounded-lg bg-[var(--teal-soft)] p-3 text-xs text-slate-700 break-all">
                Reference link: {successState.referenceLink}
              </p>
            ) : (
              <p className="text-xs text-slate-500">A direct reference link was not returned by the backend for this request.</p>
            )}

            <button
              type="button"
              onClick={() => router.push("/v2/candidate/dashboard")}
              className="rounded-[var(--radius)] bg-[var(--teal-primary)] px-4 py-2 text-sm font-semibold text-white"
            >
              Back to candidate dashboard
            </button>
          </section>
        )}
      </div>
    </V2Shell>
  );
}
