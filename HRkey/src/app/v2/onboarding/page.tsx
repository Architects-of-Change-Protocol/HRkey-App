"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import V2Shell from "@/components/v2/V2Shell";
import CandidateOnboardingForm from "@/components/v2/CandidateOnboardingForm";

type UserType = "candidate" | "company";

export default function V2OnboardingPage() {
  const searchParams = useSearchParams();
  const type = searchParams.get("type");
  const initialType = type === "candidate" || type === "company" ? type : "";

  const [selectedType, setSelectedType] = useState<UserType | "">(initialType);
  const [companyName, setCompanyName] = useState("");
  const [hiringVolume, setHiringVolume] = useState("");

  const ctaHref = useMemo(() => {
    if (selectedType === "company") return "/v2/company/dashboard";
    return "/v2/candidate/dashboard";
  }, [selectedType]);

  return (
    <V2Shell
      active="onboarding"
      userType={selectedType || "unknown"}
      title="Guided onboarding"
      subtitle="A clean setup flow to route each user to the right workspace."
    >
      <div className="mx-auto max-w-3xl space-y-6">
        {!selectedType ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Profile type missing. Select a path to continue onboarding.
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className={`rounded-xl border p-4 text-left transition ${
              selectedType === "candidate" ? "bg-[var(--teal-soft)]" : "bg-white"
            }`}
            style={{ borderColor: selectedType === "candidate" ? "var(--teal-primary)" : "var(--border)" }}
            onClick={() => setSelectedType("candidate")}
          >
            <p className="font-semibold text-slate-900">Candidate onboarding</p>
            <p className="text-sm text-slate-600">Profile setup, references, and sharing readiness.</p>
          </button>
          <button
            type="button"
            className={`rounded-xl border p-4 text-left transition ${
              selectedType === "company" ? "bg-[var(--teal-soft)]" : "bg-white"
            }`}
            style={{ borderColor: selectedType === "company" ? "var(--teal-primary)" : "var(--border)" }}
            onClick={() => setSelectedType("company")}
          >
            <p className="font-semibold text-slate-900">Company onboarding</p>
            <p className="text-sm text-slate-600">Hiring context, trust criteria, and review readiness.</p>
          </button>
        </section>

        {selectedType === "candidate" ? <CandidateOnboardingForm /> : null}

        {selectedType === "company" ? (
          <section className="space-y-4 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-lg font-semibold text-slate-900">Company setup basics</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-700">
                Company name
                <input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  style={{ borderColor: "var(--border)" }}
                  placeholder="Northstar Labs"
                />
              </label>
              <label className="text-sm text-slate-700">
                Monthly hiring volume
                <input
                  value={hiringVolume}
                  onChange={(event) => setHiringVolume(event.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  style={{ borderColor: "var(--border)" }}
                  placeholder="10 roles"
                />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              TODO: Connect this form to Supabase organization records and company onboarding persistence.
            </p>
          </section>
        ) : null}

        {selectedType !== "candidate" ? (
          <section
            className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
            style={{ borderColor: "var(--border)" }}
          >
            <Link
              href="/v2/auth"
              className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              style={{ borderColor: "var(--border)" }}
            >
              Back to auth
            </Link>
            <Link
              href={selectedType ? ctaHref : "/v2/auth"}
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: "var(--teal-primary)" }}
            >
              Complete onboarding
            </Link>
          </section>
        ) : null}
      </div>
    </V2Shell>
  );
}
