"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import CVUploadZone from "@/components/v2/CVUploadZone";
import ManualEntryForm from "@/components/v2/ManualEntryForm";

type CandidateMode = "cv-upload" | "manual-entry";

export default function CandidateOnboardingForm() {
  const router = useRouter();
  const [mode, setMode] = useState<CandidateMode>("cv-upload");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("");

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
        >
          Manual entry
        </button>
      </div>

      {mode === "cv-upload" ? (
        <div className="space-y-4">
          <CVUploadZone />
          <ManualEntryForm fullName={fullName} onFullNameChange={setFullName} role={role} onRoleChange={setRole} />
        </div>
      ) : (
        <ManualEntryForm fullName={fullName} onFullNameChange={setFullName} role={role} onRoleChange={setRole} />
      )}

      <p className="text-xs text-slate-500">TODO: Persist candidate onboarding profile to Supabase.</p>

      <section className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--border)" }}>
        <Link
          href="/v2/candidate/dashboard"
          className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          style={{ borderColor: "var(--border)" }}
        >
          Skip for now
        </Link>
        <button
          type="button"
          className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: "var(--teal-primary)" }}
          onClick={() => router.push("/v2/candidate/dashboard")}
        >
          Continue
        </button>
      </section>
    </section>
  );
}
