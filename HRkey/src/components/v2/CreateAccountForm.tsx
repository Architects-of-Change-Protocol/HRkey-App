"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  continueWithGoogle,
  getPreferredAccountType,
  persistPreferredAccountType,
  resolveNextV2Route,
  signInWithEmail,
  signUpWithEmail,
  completeOAuthCallbackIfNeeded,
  type AccountType,
  type AuthMode,
} from "@/lib/auth/auth-service";
import { supabase } from "@/lib/supabaseClient";

interface CreateAccountFormProps {
  initialType?: AccountType;
}

export default function CreateAccountForm({ initialType = "candidate" }: CreateAccountFormProps) {
  const router = useRouter();

  const [mode, setMode] = useState<AuthMode>("signup");
  const [accountType, setAccountType] = useState<AccountType>(initialType);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const preferredType = getPreferredAccountType();
    if (preferredType) {
      setAccountType(preferredType);
    }
  }, []);

  useEffect(() => {
    persistPreferredAccountType(accountType);
  }, [accountType]);

  useEffect(() => {
    let mounted = true;

    const bootstrapSession = async () => {
      try {
        await completeOAuthCallbackIfNeeded();

        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted || !session?.user) return;

        const nextRoute = await resolveNextV2Route(accountType);
        router.replace(nextRoute);
      } catch (error: any) {
        if (!mounted) return;
        setErrorMessage(error?.message || "We could not complete authentication. Please try again.");
      }
    };

    bootstrapSession();

    const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted || !session?.user) return;
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        const nextRoute = await resolveNextV2Route(accountType);
        router.replace(nextRoute);
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [accountType, router]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setErrorMessage(null);

    try {
      if (mode === "signup") {
        const { data, error } = await signUpWithEmail({
          fullName,
          email,
          password,
          accountType,
        });

        if (error) throw error;

        if (data.session) {
          const nextRoute = await resolveNextV2Route(accountType);
          router.replace(nextRoute);
          return;
        }

        setMessage("Account created. Check your email to verify your account.");
        return;
      }

      const { data, error } = await signInWithEmail({ email, password, accountType });
      if (error) throw error;

      if (data.session) {
        const nextRoute = await resolveNextV2Route(accountType);
        router.replace(nextRoute);
      }
    } catch (error: any) {
      setErrorMessage(error?.message || "Authentication failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleGoogleContinue() {
    setErrorMessage(null);
    setMessage(null);
    setIsSubmitting(true);

    try {
      const { error } = await continueWithGoogle(accountType);
      if (error) throw error;
    } catch (error: any) {
      setErrorMessage(error?.message || "Failed to connect with Google.");
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-6 shadow-sm sm:p-8">
      <div className="mb-6 space-y-2 text-center">
        <h2 className="text-2xl font-bold text-[var(--foreground)]">
          {mode === "signup" ? "Create your account" : "Log in to HRKey"}
        </h2>
        <p className="text-sm text-slate-600">
          {mode === "signup"
            ? "Start building your professional reference profile"
            : "Continue with your existing HRKey account"}
        </p>
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

      {errorMessage ? (
        <div className="mb-4 rounded-[var(--radius)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {message ? (
        <div className="mb-4 rounded-[var(--radius)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleGoogleContinue}
        disabled={isSubmitting}
        className="mb-4 flex w-full items-center justify-center gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] px-4 py-2.5 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--teal-soft)] disabled:cursor-not-allowed disabled:opacity-70"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs font-bold text-slate-700">
          G
        </span>
        Continue with Google
      </button>

      <div className="mb-4 flex items-center gap-3 text-xs uppercase tracking-[0.15em] text-slate-400">
        <span className="h-px flex-1 bg-[var(--border)]" />
        OR
        <span className="h-px flex-1 bg-[var(--border)]" />
      </div>

      <form className="space-y-3" onSubmit={handleSubmit}>
        {mode === "signup" ? (
          <label className="block text-sm text-slate-700">
            Full Name
            <input
              required
              type="text"
              name="fullName"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--input-background)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--teal-primary)]"
              placeholder="Jane Cooper"
            />
          </label>
        ) : null}

        <label className="block text-sm text-slate-700">
          Email
          <input
            required
            type="email"
            name="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
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
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--input-background)] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none transition focus:border-[var(--teal-primary)]"
            placeholder="••••••••"
          />
        </label>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 w-full rounded-[var(--radius)] bg-[var(--teal-primary)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSubmitting
            ? mode === "signup"
              ? "Creating account..."
              : "Logging in..."
            : mode === "signup"
              ? "Create account"
              : "Log in"}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-slate-600">
        {mode === "signup" ? "Already have an account? " : "Need a new account? "}
        <button
          type="button"
          onClick={() => {
            setMode((prev) => (prev === "signup" ? "login" : "signup"));
            setErrorMessage(null);
            setMessage(null);
          }}
          className="font-semibold text-[var(--teal-primary)]"
        >
          {mode === "signup" ? "Log in" : "Create one"}
        </button>
      </p>
    </div>
  );
}
