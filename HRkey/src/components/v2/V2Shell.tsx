import Link from "next/link";
import type { ReactNode } from "react";

type UserType = "candidate" | "company" | "unknown";

interface V2ShellProps {
  title: string;
  subtitle: string;
  active?: "auth" | "onboarding" | "candidate-dashboard" | "company-dashboard";
  userType?: UserType;
  children: ReactNode;
}

const linkClass =
  "rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold tracking-wide text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700";

export default function V2Shell({ title, subtitle, active, userType = "unknown", children }: V2ShellProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#ecfeff,_#f8fafc_35%,_#ffffff_70%)] px-4 py-6 sm:px-6 lg:px-10">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6 rounded-2xl border border-slate-200/80 bg-white/90 px-4 py-4 shadow-sm backdrop-blur sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-700">HRKey V2 Preview</p>
              <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">{title}</h1>
              <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link className={linkClass} href="/landing/index.html">Landing</Link>
              <Link className={linkClass} href="/v2/auth">Auth</Link>
              <Link className={linkClass} href="/v2/onboarding">Onboarding</Link>
              <Link className={linkClass} href="/v2/candidate/dashboard">Candidate</Link>
              <Link className={linkClass} href="/v2/company/dashboard">Company</Link>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <StatusPill label="Auth" active={active === "auth"} />
            <StatusPill label="Onboarding" active={active === "onboarding"} />
            <StatusPill label="Candidate Dashboard" active={active === "candidate-dashboard" || userType === "candidate"} />
            <StatusPill label="Company Dashboard" active={active === "company-dashboard" || userType === "company"} />
          </div>
        </header>

        <main className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-8">{children}</main>
      </div>
    </div>
  );
}

function StatusPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 font-semibold ${
        active ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {label}
    </span>
  );
}
