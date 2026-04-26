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

type GoalInput = {
  id: string;
  description: string;
  kpis: string[];
  customKpiInput: string;
};

const RELATIONSHIP_OPTIONS = ["Manager", "Peer", "Direct report", "Client", "Mentor", "Other"];

const FOCUS_AREA_OPTIONS = ["Leadership", "Execution", "Communication", "Collaboration", "Strategic thinking"];

const KPI_SUGGESTIONS_BY_TRACK = {
  sales: [
    "Revenue growth",
    "Quota attainment",
    "Client retention",
    "Pipeline generated",
    "Renewal rate",
    "Expansion revenue",
    "Closed-won deals",
  ],
  productDesign: ["Feature adoption", "User satisfaction", "Delivery speed", "Stakeholder alignment", "Product impact"],
  engineering: ["Delivery quality", "System reliability", "Code quality", "Incident reduction", "Technical leadership"],
  operations: ["Process efficiency", "Cost reduction", "SLA achievement", "Vendor performance", "Team productivity"],
  general: ["Delivery impact", "Collaboration", "Quality outcomes"],
} as const;

const createGoal = (): GoalInput => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  description: "",
  kpis: [],
  customKpiInput: "",
});

const getKpiSuggestions = (experience: ProfileExperienceRow | null) => {
  const title = `${experience?.title || ""}`.toLowerCase();
  if (/(sales|account executive|account manager|business development)/.test(title)) {
    return KPI_SUGGESTIONS_BY_TRACK.sales;
  }
  if (/(product|designer|design|ux|ui)/.test(title)) {
    return KPI_SUGGESTIONS_BY_TRACK.productDesign;
  }
  if (/(engineer|developer|software|platform|sre|devops)/.test(title)) {
    return KPI_SUGGESTIONS_BY_TRACK.engineering;
  }
  if (/(operations|ops|program manager|project manager|supply)/.test(title)) {
    return KPI_SUGGESTIONS_BY_TRACK.operations;
  }
  return KPI_SUGGESTIONS_BY_TRACK.general;
};

export default function NewReferenceRequestPage() {
  const router = useRouter();
  const [candidateId, setCandidateId] = useState("");
  const [experiences, setExperiences] = useState<ProfileExperienceRow[]>([]);
  const [selectedExperienceId, setSelectedExperienceId] = useState("");
  const [refereeName, setRefereeName] = useState("");
  const [refereeEmail, setRefereeEmail] = useState("");
  const [relationship, setRelationship] = useState("Manager");
  const [companyWorkedTogether, setCompanyWorkedTogether] = useState("");
  const [focusAreas, setFocusAreas] = useState<string[]>([]);
  const [goals, setGoals] = useState<GoalInput[]>([createGoal()]);
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

        if (experienceRows[0]?.id) {
          setSelectedExperienceId(experienceRows[0].id);
        }
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

  const selectedExperience = useMemo(
    () => experiences.find((experience) => experience.id === selectedExperienceId) || null,
    [experiences, selectedExperienceId]
  );

  const suggestedKpis = useMemo(() => getKpiSuggestions(selectedExperience), [selectedExperience]);

  const updateGoal = (goalId: string, updater: (goal: GoalInput) => GoalInput) => {
    setGoals((current) => current.map((goal) => (goal.id === goalId ? updater(goal) : goal)));
  };

  const toggleKpiForGoal = (goalId: string, kpi: string) => {
    updateGoal(goalId, (goal) => {
      const hasKpi = goal.kpis.includes(kpi);
      return {
        ...goal,
        kpis: hasKpi ? goal.kpis.filter((item) => item !== kpi) : [...goal.kpis, kpi],
      };
    });
  };

  const addCustomKpiToGoal = (goalId: string) => {
    updateGoal(goalId, (goal) => {
      const trimmed = goal.customKpiInput.trim();
      if (!trimmed || goal.kpis.includes(trimmed)) {
        return { ...goal, customKpiInput: "" };
      }
      return {
        ...goal,
        kpis: [...goal.kpis, trimmed],
        customKpiInput: "",
      };
    });
  };

  const toggleFocusArea = (focusArea: string) => {
    setFocusAreas((current) =>
      current.includes(focusArea) ? current.filter((item) => item !== focusArea) : [...current, focusArea]
    );
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!candidateId) {
      setErrorMessage("Please sign in before sending a reference request.");
      return;
    }

    if (!selectedExperienceId) {
      setErrorMessage("Please select an experience for this reference request.");
      return;
    }

    const sanitizedGoals = goals
      .map((goal) => ({
        description: goal.description.trim(),
        kpis: goal.kpis.filter(Boolean),
      }))
      .filter((goal) => goal.description.length > 0);

    if (sanitizedGoals.length === 0) {
      setErrorMessage("Add at least one goal or outcome for this reference request.");
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
        focusAreas,
        goals: sanitizedGoals,
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
          <form onSubmit={handleSubmit} className="space-y-5 rounded-[var(--radius)] border border-[var(--border)] bg-white p-5 sm:p-6">
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
              Selected experience
              <select
                required
                value={selectedExperienceId}
                onChange={(event) => {
                  const nextId = event.target.value;
                  setSelectedExperienceId(nextId);
                  const nextExperience = experiences.find((experience) => experience.id === nextId);
                  if (nextExperience?.company) {
                    setCompanyWorkedTogether(nextExperience.company);
                  }
                }}
                className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <option value="" disabled>
                  Select an experience
                </option>
                {experiences.map((experience) => (
                  <option key={experience.id} value={experience.id}>
                    {experience.title || "Untitled role"}
                    {experience.company ? ` · ${experience.company}` : ""}
                  </option>
                ))}
              </select>
            </label>

            <section className="space-y-2 rounded-2xl border border-[var(--border)] bg-slate-50 p-4">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Focus areas</h3>
              <p className="text-xs text-slate-600">High-level themes to evaluate in the reference.</p>
              <div className="flex flex-wrap gap-2">
                {FOCUS_AREA_OPTIONS.map((focusArea) => {
                  const selected = focusAreas.includes(focusArea);
                  return (
                    <button
                      key={focusArea}
                      type="button"
                      onClick={() => toggleFocusArea(focusArea)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                        selected
                          ? "bg-[var(--teal-soft)] text-[var(--teal-primary)] border border-[var(--teal-primary)]"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      {focusArea}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)]">What goals or outcomes should this reference validate?</h3>
                <p className="mt-1 text-xs text-slate-600">
                  Add the goals, responsibilities, or outcomes you want your referee to evaluate.
                </p>
              </div>

              <div className="space-y-3">
                {goals.map((goal, index) => (
                  <article key={goal.id} className="space-y-3 rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">Goal {index + 1}</p>
                      {goals.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setGoals((current) => current.filter((item) => item.id !== goal.id))}
                          className="text-xs font-medium text-rose-600"
                        >
                          Remove goal
                        </button>
                      ) : null}
                    </div>

                    <label className="block text-sm font-medium text-slate-700">
                      Goal / Objective
                      <textarea
                        value={goal.description}
                        onChange={(event) => updateGoal(goal.id, (item) => ({ ...item, description: event.target.value }))}
                        rows={3}
                        placeholder="e.g. Increase monthly revenue, improve client retention, lead enterprise accounts"
                        className="mt-1 w-full rounded-lg border border-[var(--border)] px-3 py-2"
                      />
                    </label>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-700">Associated KPIs</p>
                      <div className="flex flex-wrap gap-2">
                        {suggestedKpis.map((kpi) => {
                          const selected = goal.kpis.includes(kpi);
                          return (
                            <button
                              key={`${goal.id}-${kpi}`}
                              type="button"
                              onClick={() => toggleKpiForGoal(goal.id, kpi)}
                              className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                                selected
                                  ? "bg-[var(--teal-soft)] text-[var(--teal-primary)] border border-[var(--teal-primary)]"
                                  : "bg-slate-100 text-slate-600 border border-slate-200"
                              }`}
                            >
                              {kpi}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-sm font-medium text-slate-700">Add custom KPI</p>
                      <div className="flex gap-2">
                        <input
                          value={goal.customKpiInput}
                          onChange={(event) => updateGoal(goal.id, (item) => ({ ...item, customKpiInput: event.target.value }))}
                          className="w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm"
                          placeholder="Type a KPI and add"
                        />
                        <button
                          type="button"
                          onClick={() => addCustomKpiToGoal(goal.id)}
                          className="rounded-lg border border-[var(--teal-primary)] px-3 py-2 text-xs font-semibold text-[var(--teal-primary)]"
                        >
                          Add KPI
                        </button>
                      </div>
                    </div>

                    {goal.kpis.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {goal.kpis.map((kpi) => (
                          <button
                            key={`${goal.id}-selected-${kpi}`}
                            type="button"
                            onClick={() => toggleKpiForGoal(goal.id, kpi)}
                            className="rounded-full border border-[var(--teal-primary)] bg-[var(--teal-soft)] px-3 py-1.5 text-xs font-medium text-[var(--teal-primary)]"
                          >
                            {kpi} ✕
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setGoals((current) => [...current, createGoal()])}
                className="w-full rounded-lg border border-dashed border-[var(--teal-primary)] px-3 py-2 text-sm font-semibold text-[var(--teal-primary)]"
              >
                + Add another goal
              </button>
            </section>

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
            <p className="text-sm text-slate-700">Your request has been created with the existing HRKey reference workflow.</p>

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
              onClick={() => router.push("/v2/candidate/references/requests")}
              className="rounded-[var(--radius)] bg-[var(--teal-primary)] px-4 py-2 text-sm font-semibold text-white"
            >
              Go to Requests Center
            </button>
          </section>
        )}
      </div>
    </V2Shell>
  );
}
