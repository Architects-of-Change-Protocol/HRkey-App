"use client";

import { useState } from "react";
import Link from "next/link";

const strengths = [
  { label: "Leadership", score: 4.9 },
  { label: "Communication", score: 4.7 },
  { label: "Reliability", score: 5.0 },
  { label: "Sales Execution", score: 4.8 },
  { label: "Teamwork", score: 4.6 },
];

const visibilityModes = [
  {
    id: "full",
    title: "Full Public",
    description: "No redactions",
    score: 100,
  },
  {
    id: "partial",
    title: "Partial Redaction",
    description: "User can hide selected phrases",
    score: 92,
  },
  {
    id: "hidden",
    title: "Fully Redacted",
    description: "Reference title exists but body hidden",
    score: 70,
  },
] as const;

export default function ReferenceDetailPage() {
  const [showVisibilityModal, setShowVisibilityModal] = useState(false);
  const [selectedMode, setSelectedMode] = useState<(typeof visibilityModes)[number]["id"]>("partial");

  return (
    <div className="min-h-screen bg-[var(--gray-light)] text-[var(--foreground)]">
      <header className="sticky top-0 z-20 bg-slate-900 text-white shadow-sm">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4 py-3">
          <Link href="/v2/candidate/dashboard" className="text-xl leading-none" aria-label="Go back to dashboard">
            ←
          </Link>
          <h1 className="text-sm font-semibold tracking-wide">Reference Details</h1>
          <button type="button" className="text-xl leading-none" aria-label="More options">
            ⋯
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-4">
        <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Job Title</p>
              <p className="text-lg font-bold text-slate-900">Senior Account Manager</p>
            </div>
            <div className="rounded-xl bg-[var(--teal-soft)] px-3 py-2 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--teal-primary)]">Rating</p>
              <p className="text-lg font-bold text-slate-900">4.8 / 5</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Company</p>
              <p className="font-semibold text-slate-900">TechCorp</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Completed</p>
              <p className="font-semibold text-slate-900">Feb 2026</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm font-medium text-emerald-700">
            ✓ Verified Professional Reference
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs uppercase tracking-wide text-slate-500">Confidence Score</p>
              <p className="text-sm font-bold text-slate-900">92 / 100</p>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-[92%] rounded-full bg-[var(--teal-primary)]" />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Confidence score reflects transparency and reference integrity.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Written Feedback</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">
            Sarah consistently exceeded <RedactedBlock width="w-24" /> and built strong client relationships.
            She demonstrated <RedactedBlock width="w-32" /> across strategic accounts.
          </p>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Strength Ratings</h2>
          <div className="mt-3 space-y-3">
            {strengths.map((strength) => (
              <div key={strength.label}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700">{strength.label}</span>
                  <span className="font-semibold text-slate-900">{strength.score.toFixed(1)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[var(--teal-primary)]"
                    style={{ width: `${(strength.score / 5) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Relationship Context</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <InfoRow label="Referee Role" value="Regional Sales Director" />
            <InfoRow label="Relationship" value="Direct Manager" />
            <InfoRow label="Worked Together" value="2023–2025" />
            <InfoRow label="Visibility" value="Partially Redacted by Candidate" />
          </dl>
        </section>

        <section className="rounded-2xl border border-teal-100 bg-gradient-to-r from-[var(--teal-soft)] to-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Confidence Score Impact</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-700">
            This reference contains user-redacted sections. Transparency adjustments reduced score from 97 → 92.
          </p>

          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            Higher transparency improves credibility signals for recruiters.
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/80">
              <div className="h-full w-[92%] rounded-full bg-[var(--teal-primary)]" />
            </div>
            <span className="text-sm font-bold text-slate-900">92</span>
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Action Center</h2>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={() => setShowVisibilityModal(true)}
              className="rounded-xl bg-[var(--teal-primary)] px-4 py-3 text-sm font-semibold text-white shadow-sm"
            >
              Manage Visibility
            </button>
            <button type="button" className="rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-slate-700">
              Share Profile
            </button>
            <button type="button" className="rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-slate-700">
              Download PDF
            </button>
            <button type="button" className="rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-semibold text-slate-700">
              Request Another Reference
            </button>
          </div>
        </section>
      </main>

      {showVisibilityModal ? (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-950/35 px-4 pb-4 pt-10">
          <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900">Manage Visibility</h3>
                <p className="mt-1 text-xs text-slate-500">More redaction = lower confidence score.</p>
              </div>
              <button type="button" onClick={() => setShowVisibilityModal(false)} className="text-xl leading-none text-slate-400">
                ×
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {visibilityModes.map((mode) => {
                const active = selectedMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setSelectedMode(mode.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-[var(--teal-primary)] bg-[var(--teal-soft)]"
                        : "border-[var(--border)] bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{mode.title}</p>
                        <p className="text-xs text-slate-600">{mode.description}</p>
                      </div>
                      <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                        {mode.score}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-[var(--border)] bg-slate-50 p-3 text-xs text-slate-600">
              <p>100 = Full visible</p>
              <p>92 = Partial hidden</p>
              <p>70 = Fully hidden</p>
            </div>

            <button
              type="button"
              onClick={() => setShowVisibilityModal(false)}
              className="mt-4 w-full rounded-xl bg-[var(--teal-primary)] px-4 py-3 text-sm font-semibold text-white"
            >
              Save Visibility Settings
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RedactedBlock({ width }: { width: string }) {
  return <span className={`mx-1 inline-block h-4 ${width} rounded-sm bg-black align-middle`} aria-label="Redacted content" />;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}
