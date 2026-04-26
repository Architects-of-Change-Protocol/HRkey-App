"use client";

import type { CSSProperties } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import V2Shell from "@/components/v2/V2Shell";
import { saveCandidateWorkExperiences } from "@/lib/profile/candidate-profile-service";

type ExperienceDraft = {
  role: string;
  company: string;
  duration: string;
  keyResponsibilities: string;
};

const BLANK_EXPERIENCE: ExperienceDraft = {
  role: "",
  company: "",
  duration: "",
  keyResponsibilities: "",
};

const MOCK_PARSED_EXPERIENCES: ExperienceDraft[] = [
  {
    role: "Senior Product Manager",
    company: "Northstar Labs",
    duration: "Jan 2022 - Present",
    keyResponsibilities:
      "Led roadmap planning, coordinated cross-functional launches, and managed KPI reporting for enterprise workflows.",
  },
  {
    role: "Product Manager",
    company: "Brightlane",
    duration: "Mar 2019 - Dec 2021",
    keyResponsibilities:
      "Owned candidate onboarding funnel, partnered with design on UX refreshes, and improved activation conversion through experiments.",
  },
];

function isExperienceEmpty(experience: ExperienceDraft) {
  return Object.values(experience).every((value) => value.trim().length === 0);
}

function ExperienceReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const shouldUseMockPrefill = searchParams.get("prefill") === "mock";

  const [experiences, setExperiences] = useState<ExperienceDraft[]>(
    shouldUseMockPrefill ? MOCK_PARSED_EXPERIENCES : [BLANK_EXPERIENCE]
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const completedCount = useMemo(
    () => experiences.filter((experience) => !isExperienceEmpty(experience)).length,
    [experiences]
  );

  const updateExperience = (index: number, field: keyof ExperienceDraft, value: string) => {
    setExperiences((previous) =>
      previous.map((experience, currentIndex) =>
        currentIndex === index ? { ...experience, [field]: value } : experience
      )
    );
  };

  const addExperience = () => {
    setExperiences((previous) => [...previous, { ...BLANK_EXPERIENCE }]);
  };

  const handleContinue = async () => {
    if (isSaving) return;

    setIsSaving(true);
    setErrorMessage("");

    try {
      await saveCandidateWorkExperiences(
        experiences.map((experience) => ({
          role: experience.role,
          company: experience.company,
          duration: experience.duration,
          keyResponsibilities: experience.keyResponsibilities,
        }))
      );

      router.push("/v2/onboarding/details");
    } catch (error) {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        router.push("/v2/auth?type=candidate");
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Failed to save work experience.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <V2Shell
      active="onboarding"
      userType="candidate"
      title="Experience review"
      subtitle="Review and refine the work history extracted from your CV before continuing."
    >
      <section className="mx-auto max-w-3xl space-y-5 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Candidate onboarding</span>
            <span>Step 2 of 3</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--gray-light)" }}>
            <div className="h-full w-2/3 rounded-full" style={{ backgroundColor: "var(--teal-primary)" }} />
          </div>
          <p className="text-sm text-slate-600">
            {completedCount} experience {completedCount === 1 ? "entry" : "entries"} ready to save.
          </p>
        </div>

        <div className="space-y-4">
          {experiences.map((experience, index) => (
            <article key={`experience-${index}`} className="rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Experience {index + 1}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-700">
                  Role
                  <input
                    value={experience.role}
                    onChange={(event) => updateExperience(index, "role", event.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none transition focus:ring-2"
                    style={{ borderColor: "var(--border)", "--tw-ring-color": "var(--teal-primary)" } as CSSProperties}
                    placeholder="Senior Product Manager"
                  />
                </label>

                <label className="text-sm text-slate-700">
                  Company
                  <input
                    value={experience.company}
                    onChange={(event) => updateExperience(index, "company", event.target.value)}
                    className="mt-1 w-full rounded-lg border px-3 py-2 outline-none transition focus:ring-2"
                    style={{ borderColor: "var(--border)", "--tw-ring-color": "var(--teal-primary)" } as CSSProperties}
                    placeholder="Northstar Labs"
                  />
                </label>
              </div>

              <label className="mt-4 block text-sm text-slate-700">
                Duration
                <input
                  value={experience.duration}
                  onChange={(event) => updateExperience(index, "duration", event.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 outline-none transition focus:ring-2"
                  style={{ borderColor: "var(--border)", "--tw-ring-color": "var(--teal-primary)" } as CSSProperties}
                  placeholder="Jan 2022 - Present"
                />
              </label>

              <label className="mt-4 block text-sm text-slate-700">
                Key Responsibilities
                <textarea
                  value={experience.keyResponsibilities}
                  onChange={(event) => updateExperience(index, "keyResponsibilities", event.target.value)}
                  className="mt-1 min-h-[110px] w-full rounded-lg border px-3 py-2 outline-none transition focus:ring-2"
                  style={{ borderColor: "var(--border)", "--tw-ring-color": "var(--teal-primary)" } as CSSProperties}
                  placeholder="Summarize your core responsibilities and impact."
                />
              </label>
            </article>
          ))}
        </div>

        <button
          type="button"
          className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          style={{ borderColor: "var(--border)" }}
          onClick={addExperience}
          disabled={isSaving}
        >
          Add another experience
        </button>

        {errorMessage ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert" aria-live="polite">
            {errorMessage}
          </p>
        ) : null}

        <section
          className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: "var(--border)" }}
        >
          <Link
            href="/v2/onboarding/details"
            className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            style={{ borderColor: "var(--border)" }}
          >
            Skip for now
          </Link>
          <button
            type="button"
            className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: "var(--teal-primary)" }}
            onClick={handleContinue}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Continue"}
          </button>
        </section>
      </section>
    </V2Shell>
  );
}

export default function V2ExperienceReviewPage() {
  return (
    <Suspense fallback={null}>
      <ExperienceReviewContent />
    </Suspense>
  );
}
