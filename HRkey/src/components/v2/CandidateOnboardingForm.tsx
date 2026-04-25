"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import CVUploadZone from "@/components/v2/CVUploadZone";
import ManualEntryForm from "@/components/v2/ManualEntryForm";
import { saveCandidateOnboarding, uploadCV } from "@/lib/profile/candidate-profile-service";

type CandidateMode = "cv-upload" | "manual-entry";

type CandidateFormValues = {
  full_name: string;
  title: string;
  company: string;
  professional_summary: string;
};

const INITIAL_FORM_VALUES: CandidateFormValues = {
  full_name: "",
  title: "",
  company: "",
  professional_summary: "",
};

export default function CandidateOnboardingForm() {
  const router = useRouter();
  const [mode, setMode] = useState<CandidateMode>("cv-upload");
  const [formValues, setFormValues] = useState<CandidateFormValues>(INITIAL_FORM_VALUES);
  const [selectedCV, setSelectedCV] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const updateField = (field: keyof CandidateFormValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleContinue = async () => {
    if (isSaving) return;

    setErrorMessage("");
    setIsSaving(true);

    try {
      await saveCandidateOnboarding({
        ...formValues,
        onboarding_complete: true,
      });

      if (selectedCV) {
        await uploadCV(selectedCV);
      }

      router.push("/v2/candidate/dashboard");
    } catch (error) {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        router.push("/v2/auth?type=candidate");
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Failed to save onboarding profile.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="space-y-5 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}>
      <div className="space-y-3">
        <div className="flex items-center justify-between text-xs font-medium text-slate-600">
          <span>Candidate onboarding</span>
          <span>Step 1 of 2</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--gray-light)" }}>
          <div className="h-full w-1/2 rounded-full" style={{ backgroundColor: "var(--teal-primary)" }} />
        </div>
      </div>

      <div
        className="grid gap-3 rounded-xl p-1 sm:grid-cols-2"
        style={{ backgroundColor: "var(--teal-soft)", borderRadius: "var(--radius)" }}
      >
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-sm font-medium transition"
          style={
            {
              backgroundColor: mode === "cv-upload" ? "var(--teal-light)" : "transparent",
              color: "#0f172a",
            } as CSSProperties
          }
          onClick={() => setMode("cv-upload")}
          disabled={isSaving}
        >
          Upload CV
        </button>
        <button
          type="button"
          className="rounded-lg px-3 py-2 text-sm font-medium transition"
          style={
            {
              backgroundColor: mode === "manual-entry" ? "var(--teal-light)" : "transparent",
              color: "#0f172a",
            } as CSSProperties
          }
          onClick={() => setMode("manual-entry")}
          disabled={isSaving}
        >
          Manual entry
        </button>
      </div>

      {mode === "cv-upload" ? <CVUploadZone onFileAccepted={setSelectedCV} /> : null}

      <ManualEntryForm
        full_name={formValues.full_name}
        onFullNameChange={(value) => updateField("full_name", value)}
        title={formValues.title}
        onTitleChange={(value) => updateField("title", value)}
        company={formValues.company}
        onCompanyChange={(value) => updateField("company", value)}
        professional_summary={formValues.professional_summary}
        onProfessionalSummaryChange={(value) => updateField("professional_summary", value)}
      />

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
          href="/v2/candidate/dashboard"
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
  );
}
