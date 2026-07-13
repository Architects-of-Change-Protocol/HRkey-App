"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export default function EarlyAccessForm() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-8 flex flex-col sm:flex-row justify-center gap-3 max-w-md mx-auto"
    >
      <input
        type="email"
        name="email"
        placeholder="you@company.com"
        aria-label="Email address"
        disabled={submitted}
        className="flex-1 rounded-md border border-slate-300 px-4 py-3 text-slate-900 disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={submitted}
        className="inline-block rounded-md bg-[#FF6B35] px-6 py-3 text-white font-semibold hover:opacity-90 disabled:opacity-60"
      >
        {submitted ? "Thanks! Coming Soon" : "Private Beta"}
      </button>
    </form>
  );
}
