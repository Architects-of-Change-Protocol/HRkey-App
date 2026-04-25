"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type UserType = "candidate" | "company";

interface CreateAccountFormProps {
  initialType?: UserType;
}

export default function CreateAccountForm({ initialType = "candidate" }: CreateAccountFormProps) {
  const [accountType, setAccountType] = useState<UserType>(initialType);
  const router = useRouter();

  const nextRoute = useMemo(() => `/v2/onboarding?type=${accountType}`, [accountType]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(nextRoute);
  }

  function handleGoogleContinue() {
    // TODO: Connect Supabase Google OAuth
    router.push(nextRoute);
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm sm:p-8">
      <div className="mb-6 space-y-2 text-center">
        <h2 className="text-2xl font-bold text-[var(--foreground)]">Create your account</h2>
        <p className="text-sm text-slate-600">Start building your professional reference profile</p>
      </div>

      <div className="mb-5 grid grid-cols-2 rounded-full bg-[var(--gray-light)] p-1">
        <button
          type="button"
          onClick={() => setAccountType("candidate")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            accountType === "candidate"
              ? "bg-[var(--teal-primary)] text-white"
              : "text-slate-600 hover:text-[var(--foreground)]"
          }`}
        >
          Candidate
        </button>
        <button
          type="button"
          onClick={() => setAccountType("company")}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
            accountType === "company"
              ? "bg-[var(--teal-primary)] text-white"
              : "text-slate-600 hover:text-[var(--foreground)]"
          }`}
        >
          Company
        </button>
      </div>

      <button
        type="button"
        onClick={handleGoogleContinue}
        className="mb-4 flex w-full items-center justify-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--teal-soft)]"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-700">G</span>
        Continue with Google
      </button>

      <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.15em] text-slate-400">
        <span className="h-px flex-1 bg-[var(--border)]" />
        OR
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        <label className="block text-sm text-slate-700">
          Full Name
          <input
            required
            type="text"
            name="fullName"
            className="mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--input-background)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--teal-primary)]"
            placeholder="Jane Cooper"
          />
        </label>

        <label className="block text-sm text-slate-700">
          Email
          <input
            required
            type="email"
            name="email"
            className="mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--input-background)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--teal-primary)]"
            placeholder="jane@company.com"
          />
        </label>

        <label className="block text-sm text-slate-700">
          Password
          <input
            required
            type="password"
            name="password"
            className="mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--input-background)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--teal-primary)]"
            placeholder="••••••••"
          />
        </label>

        <button
          type="submit"
          className="mt-2 w-full rounded-[var(--radius)] bg-[var(--teal-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95"
        >
          Create account
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-600">
        Already have an account? <button type="button" className="font-semibold text-[var(--teal-primary)]">Log in</button>
      </p>
    </div>
  );
}
