"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import V2Shell from "@/components/v2/V2Shell";
import { completeCandidateOnboarding } from "@/lib/profile/candidate-profile-service";

type EducationDraft = {
  degree: string;
  institution: string;
};

type TagField = "languages" | "certifications" | "skills";

const BLANK_EDUCATION: EducationDraft = {
  degree: "",
  institution: "",
};

export default function V2OnboardingDetailsPage() {
  const router = useRouter();
  const [education, setEducation] = useState<EducationDraft[]>([{ ...BLANK_EDUCATION }]);
  const [languages, setLanguages] = useState<string[]>([]);
  const [certifications, setCertifications] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);

  const [languageInput, setLanguageInput] = useState("");
  const [certificationInput, setCertificationInput] = useState("");
  const [skillInput, setSkillInput] = useState("");

  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const updateEducation = (index: number, field: keyof EducationDraft, value: string) => {
    setEducation((prev) => prev.map((row, currentIndex) => (currentIndex === index ? { ...row, [field]: value } : row)));
  };

  const addEducation = () => {
    setEducation((prev) => [...prev, { ...BLANK_EDUCATION }]);
  };

  const addTag = (field: TagField, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const setterMap = {
      languages: setLanguages,
      certifications: setCertifications,
      skills: setSkills,
    };

    setterMap[field]((prev) => {
      if (prev.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      return [...prev, trimmed];
    });
  };

  const removeTag = (field: TagField, value: string) => {
    const setterMap = {
      languages: setLanguages,
      certifications: setCertifications,
      skills: setSkills,
    };

    setterMap[field]((prev) => prev.filter((item) => item !== value));
  };

  const handleTagKeyDown = (field: TagField, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;

    event.preventDefault();

    if (field === "languages") {
      addTag(field, languageInput);
      setLanguageInput("");
      return;
    }

    if (field === "certifications") {
      addTag(field, certificationInput);
      setCertificationInput("");
      return;
    }

    addTag(field, skillInput);
    setSkillInput("");
  };

  const handleFinish = async (skipDetails: boolean) => {
    if (isSaving) return;

    setIsSaving(true);
    setErrorMessage("");

    try {
      if (skipDetails) {
        await completeCandidateOnboarding();
      } else {
        await completeCandidateOnboarding({
          education,
          languages,
          certifications,
          skills,
        });
      }

      router.push("/v2/candidate/dashboard");
    } catch (error) {
      if (error instanceof Error && error.message === "AUTH_REQUIRED") {
        router.push("/v2/auth?type=candidate");
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : "Failed to save onboarding details.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <V2Shell
      active="onboarding"
      userType="candidate"
      title="Add more details (optional)"
      subtitle="This helps make your references more meaningful"
    >
      <section className="mx-auto max-w-3xl space-y-6 rounded-xl border p-5" style={{ borderColor: "var(--border)" }}>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Candidate onboarding</span>
            <span>Step 3 of 3</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ backgroundColor: "var(--gray-light)" }}>
            <div className="h-full w-full rounded-full" style={{ backgroundColor: "var(--teal-primary)" }} />
          </div>
        </div>

        <section className="space-y-4 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
          <h2 className="text-sm font-semibold text-slate-900">Education</h2>
          {education.map((row, index) => (
            <div key={`education-${index}`} className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm text-slate-700">
                Degree / field
                <input
                  value={row.degree}
                  onChange={(event) => updateEducation(index, "degree", event.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 outline-none transition focus:ring-2"
                  style={{ borderColor: "var(--border)", "--tw-ring-color": "var(--teal-primary)" } as CSSProperties}
                  placeholder="B.S. Computer Science"
                />
              </label>

              <label className="text-sm text-slate-700">
                Institution
                <input
                  value={row.institution}
                  onChange={(event) => updateEducation(index, "institution", event.target.value)}
                  className="mt-1 w-full rounded-lg border px-3 py-2 outline-none transition focus:ring-2"
                  style={{ borderColor: "var(--border)", "--tw-ring-color": "var(--teal-primary)" } as CSSProperties}
                  placeholder="University of Costa Rica"
                />
              </label>
            </div>
          ))}

          <button
            type="button"
            onClick={addEducation}
            disabled={isSaving}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            style={{ borderColor: "var(--border)" }}
          >
            Add another education entry
          </button>
        </section>

        <TagInputSection
          title="Languages"
          hint="Type a language and press Enter"
          value={languageInput}
          onValueChange={setLanguageInput}
          onKeyDown={(event) => handleTagKeyDown("languages", event)}
          tags={languages}
          onRemove={(value) => removeTag("languages", value)}
          placeholder="English"
        />

        <TagInputSection
          title="Certifications"
          hint="e.g. PMP, AWS Certified"
          value={certificationInput}
          onValueChange={setCertificationInput}
          onKeyDown={(event) => handleTagKeyDown("certifications", event)}
          tags={certifications}
          onRemove={(value) => removeTag("certifications", value)}
          placeholder="PMP"
        />

        <TagInputSection
          title="Key Skills"
          hint="e.g. Sales, Leadership, Data Analysis"
          value={skillInput}
          onValueChange={setSkillInput}
          onKeyDown={(event) => handleTagKeyDown("skills", event)}
          tags={skills}
          onRemove={(value) => removeTag("skills", value)}
          placeholder="Leadership"
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
          <button
            type="button"
            className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            style={{ borderColor: "var(--border)" }}
            onClick={() => handleFinish(true)}
            disabled={isSaving}
          >
            Skip for now
          </button>
          <button
            type="button"
            className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: "var(--teal-primary)" }}
            onClick={() => handleFinish(false)}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Finish"}
          </button>
        </section>
      </section>
    </V2Shell>
  );
}

type TagInputSectionProps = {
  title: string;
  hint: string;
  value: string;
  onValueChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  tags: string[];
  onRemove: (tag: string) => void;
  placeholder: string;
};

function TagInputSection({
  title,
  hint,
  value,
  onValueChange,
  onKeyDown,
  tags,
  onRemove,
  placeholder,
}: TagInputSectionProps) {
  return (
    <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--border)" }}>
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-600">{hint}</p>
      </div>

      <input
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
        className="w-full rounded-lg border px-3 py-2 outline-none transition focus:ring-2"
        style={{ borderColor: "var(--border)", "--tw-ring-color": "var(--teal-primary)" } as CSSProperties}
        placeholder={placeholder}
      />

      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <button
              type="button"
              key={tag}
              onClick={() => onRemove(tag)}
              className="rounded-full bg-[var(--teal-soft)] px-3 py-1 text-xs font-medium text-slate-700"
              title="Remove"
            >
              {tag} ×
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
