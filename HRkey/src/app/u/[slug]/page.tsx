"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "@/lib/supabaseClient";

type PublicServiceProfile = {
  userId: string;
  fullName: string | null;
  headline: string | null;
  skills: string[] | null;
  hrScore: number;
};

type UserRow = {
  id: string;
  full_name?: string | null;
  name?: string | null;
  title?: string | null;
  headline?: string | null;
  company?: string | null;
  location?: string | null;
  professional_summary?: string | null;
  public_handle?: string | null;
  avatar_url?: string | null;
  cv_url?: string | null;
  skills?: string[] | string | null;
  languages?: string[] | string | null;
  certifications?: string[] | string | null;
  onboarding_details?: Record<string, unknown> | null;
};

type ReferenceRow = {
  id: string;
  role?: string | null;
  company?: string | null;
  summary?: string | null;
  overall_rating?: number | null;
  is_hidden?: boolean | null;
  validation_status?: string | null;
  consistency_score?: number | null;
  detailed_feedback?: Record<string, unknown> | null;
};

type ExperienceRow = {
  id: string;
  role?: string | null;
  company?: string | null;
  duration?: string | null;
  key_responsibilities?: string | null;
  visibility?: string | null;
};

type CandidateProfile = {
  id: string;
  fullName: string;
  title: string;
  company: string;
  location: string;
  avatar: string;
  reputationScore: number;
  confidenceScore: number;
  about: string;
  resumeUrl: string;
  strengths: string[];
  skills: string[];
  languages: string[];
  certifications: string[];
  references: Array<{
    id: string;
    role: string;
    company: string;
    rating: number | null;
    confidence: number;
    summary: string;
    isPartial: boolean;
  }>;
  experiences: Array<{
    id: string;
    role: string;
    company: string;
    duration: string;
    summary: string;
  }>;
};

const ENV_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_PUBLIC_URL ||
  "";

const resolveApiBase = () => {
  if (ENV_API_BASE) return ENV_API_BASE.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    const isLocal = origin.includes("localhost:3000") || origin.includes("127.0.0.1:3000");
    return isLocal ? "http://localhost:3001" : origin;
  }
  return "http://localhost:3001";
};

const toArray = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
};

const slugToName = (slug: string) => slug.split("-").filter(Boolean).map((part) => `${part[0]?.toUpperCase() || ""}${part.slice(1)}`).join(" ");

const isPartiallyRedacted = (reference: ReferenceRow) => {
  if (reference.validation_status === "APPROVED_WITH_WARNINGS") return true;
  const recommendation = String(reference.detailed_feedback?.recommendation || "").toLowerCase();
  return recommendation.includes("[redacted]") || recommendation.includes("***");
};

const scoreConfidence = (reference: ReferenceRow) => {
  if (reference.is_hidden) return 0;
  const consistency = typeof reference.consistency_score === "number" ? reference.consistency_score : 0.72;
  let score = Math.round(Math.max(0.35, Math.min(0.99, consistency)) * 100);
  if (isPartiallyRedacted(reference)) score = Math.max(58, score - 14);
  return score;
};

const fallbackStrengths = (skills: string[]) =>
  Array.from(new Set(["Leadership", "Revenue Growth", "Client Retention", "Operations", "Team Building", ...skills.slice(0, 4)])).slice(0, 8);

async function fetchPublicCore(slug: string): Promise<PublicServiceProfile | null> {
  try {
    const response = await fetch(`${resolveApiBase()}/api/public/candidates/${encodeURIComponent(slug)}`);
    if (!response.ok) return null;
    return (await response.json()) as PublicServiceProfile;
  } catch {
    return null;
  }
}

async function fetchFromTables(slug: string): Promise<CandidateProfile | null> {
  const fullNameGuess = slugToName(slug);

  const { data: userRows } = await supabase
    .from("users")
    .select("id, full_name, name, title, headline, company, location, professional_summary, public_handle, avatar_url, cv_url, skills, languages, certifications, onboarding_details")
    .or(`public_handle.eq.${slug},full_name.ilike.%${fullNameGuess}%`)
    .limit(1);

  const user = (userRows?.[0] || null) as UserRow | null;
  if (!user?.id) return null;

  const [referencesResult, experiencesResult] = await Promise.all([
    supabase
      .from("references")
      .select("id, role, company, summary, overall_rating, is_hidden, validation_status, consistency_score, detailed_feedback")
      .eq("owner_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("profile_experiences")
      .select("id, role, company, duration, key_responsibilities, visibility")
      .eq("profile_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const references = ((referencesResult.data || []) as ReferenceRow[])
    .filter((item) => !item.is_hidden)
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      role: item.role?.trim() || "Reference",
      company: item.company?.trim() || "Company",
      rating: typeof item.overall_rating === "number" ? item.overall_rating : null,
      confidence: scoreConfidence(item),
      summary: item.summary?.trim() || "No summary shared for this reference.",
      isPartial: isPartiallyRedacted(item),
    }));

  const experiences = ((experiencesResult.data || []) as ExperienceRow[])
    .filter((item) => item.visibility !== "private")
    .map((item) => ({
      id: item.id,
      role: item.role?.trim() || "Role",
      company: item.company?.trim() || "Company",
      duration: item.duration?.trim() || "Dates unavailable",
      summary: item.key_responsibilities?.trim() || "Experience details not provided.",
    }));

  const details = user.onboarding_details || {};
  const skills = Array.from(new Set([...toArray(user.skills), ...toArray((details as Record<string, unknown>).skills)])).slice(0, 14);
  const languages = Array.from(new Set([...toArray(user.languages), ...toArray((details as Record<string, unknown>).languages)])).slice(0, 10);
  const certifications = Array.from(new Set([...toArray(user.certifications), ...toArray((details as Record<string, unknown>).certifications)])).slice(0, 10);

  const reputationScore = references.length ? Math.round(references.reduce((acc, item) => acc + ((item.rating || 0) / 5) * 100, 0) / references.length) : 72;
  const confidenceScore = references.length ? Math.round(references.reduce((acc, item) => acc + item.confidence, 0) / references.length) : 68;

  return {
    id: user.id,
    fullName: user.full_name || user.name || fullNameGuess,
    title: user.title || user.headline || "Professional",
    company: user.company || "Independent",
    location: user.location || "",
    avatar:
      user.avatar_url ||
      `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.name || fullNameGuess)}&background=ccfbf1&color=0f172a`,
    reputationScore,
    confidenceScore,
    about: user.professional_summary?.trim() || "Professional summary not available yet.",
    resumeUrl: user.cv_url || "",
    strengths: fallbackStrengths(skills),
    skills,
    languages,
    certifications,
    references,
    experiences,
  };
}

export default function PublicCandidateSlugPage() {
  const params = useParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params?.slug) ? params.slug[0] : params?.slug;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<CandidateProfile | null>(null);

  useEffect(() => {
    if (!slug) {
      setError("Profile URL is invalid.");
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);

      const [serviceProfile, tableProfile] = await Promise.all([fetchPublicCore(slug), fetchFromTables(slug)]);

      if (!tableProfile && !serviceProfile) {
        setError("This profile is unavailable or private.");
        setLoading(false);
        return;
      }

      const merged = {
        ...(tableProfile || {
          id: serviceProfile?.userId || slug,
          fullName: serviceProfile?.fullName || slugToName(slug),
          title: serviceProfile?.headline || "Professional",
          company: "",
          location: "",
          avatar: "",
          reputationScore: 70,
          confidenceScore: 65,
          about: "",
          resumeUrl: "",
          strengths: fallbackStrengths(serviceProfile?.skills || []),
          skills: serviceProfile?.skills || [],
          languages: [],
          certifications: [],
          references: [],
          experiences: [],
        }),
      } as CandidateProfile;

      if (serviceProfile?.hrScore && serviceProfile.hrScore > 0) {
        merged.reputationScore = Math.round(serviceProfile.hrScore);
      }

      setProfile(merged);
      setLoading(false);
    };

    load().catch(() => {
      setError("Could not load this candidate profile.");
      setLoading(false);
    });
  }, [slug]);

  const pageTitle = useMemo(() => {
    if (!profile) return "Verified Professional References | HRKey";
    return `${profile.fullName} | Verified Professional References | HRKey`;
  }, [profile]);

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Link href="/" className="flex items-center gap-2">
            <span className="rounded-lg bg-teal-600 px-2 py-1 text-xs font-bold text-white">HRKey</span>
            <span className="text-sm font-semibold text-slate-900">Professional Reputation Passport</span>
          </Link>
          <Link href="/v2/auth?type=candidate" className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700">Create your HRKey</Link>
        </header>

        {loading ? <Card><p className="text-sm text-slate-600">Loading profile…</p></Card> : null}
        {error ? <Card><p className="text-sm text-amber-700">{error}</p></Card> : null}

        {!loading && !error && profile ? (
          <main className="space-y-5">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex gap-4">
                  <Image src={profile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.fullName)}&background=ccfbf1&color=0f172a`} alt={`${profile.fullName} avatar`} width={64} height={64} className="h-16 w-16 rounded-2xl border border-slate-200 object-cover" unoptimized />
                  <div>
                    <h1 className="text-2xl font-bold text-slate-900">{profile.fullName}</h1>
                    <p className="text-sm text-slate-700">{profile.title}</p>
                    <p className="text-sm text-slate-600">{[profile.company, profile.location].filter(Boolean).join(" • ")}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <ScoreChip label="Reputation" value={`${profile.reputationScore}`} />
                  <ScoreChip label="Confidence" value={`${profile.confidenceScore}`} />
                  <ScoreChip label="Verified refs" value={`${profile.references.length}`} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white">Request Intro</button>
                <a href={profile.resumeUrl || "#"} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700" download>Download Resume</a>
              </div>
            </section>

            <Card title="About"><p className="text-sm leading-relaxed text-slate-700">{profile.about}</p></Card>

            <Card title="Verified References">
              <div className="space-y-3">
                {profile.references.length === 0 ? <p className="text-sm text-slate-600">No public references available.</p> : null}
                {profile.references.map((reference) => (
                  <article key={reference.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{reference.role}</p>
                        <p className="text-xs text-slate-600">{reference.company}</p>
                      </div>
                      <div className="flex gap-2">
                        <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-slate-700">⭐ {reference.rating ? reference.rating.toFixed(1) : "—"}</span>
                        <span className="rounded-full bg-teal-100 px-2 py-1 text-xs font-semibold text-teal-800">{reference.confidence}% confidence</span>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">{reference.summary.slice(0, 220)}</p>
                    <div className="mt-2 flex items-center justify-between">
                      {reference.isPartial ? <span className="text-xs font-medium text-amber-700">Partially redacted view</span> : <span />}
                      <button type="button" className="text-xs font-semibold text-teal-700">View full reference</button>
                    </div>
                  </article>
                ))}
              </div>
            </Card>

            <Card title="Strength Areas"><ChipRow items={profile.strengths} /></Card>

            <Card title="Skills / Languages / Certifications">
              <StackedChips heading="Skills" items={profile.skills} />
              <StackedChips heading="Languages" items={profile.languages} />
              <StackedChips heading="Certifications" items={profile.certifications} />
            </Card>

            <Card title="Career Timeline">
              <div className="space-y-3">
                {profile.experiences.length === 0 ? <p className="text-sm text-slate-600">Timeline details unavailable.</p> : null}
                {profile.experiences.map((experience) => (
                  <div key={experience.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-900">{experience.role}</p>
                    <p className="text-xs text-slate-600">{experience.company} • {experience.duration}</p>
                    <p className="mt-2 text-sm text-slate-700">{experience.summary}</p>
                  </div>
                ))}
              </div>
            </Card>

            <section className="rounded-3xl border border-teal-100 bg-gradient-to-r from-teal-50 to-white p-6 text-center shadow-sm">
              <p className="text-sm text-slate-700">Want a profile like this?</p>
              <Link href="/v2/auth?type=candidate" className="mt-3 inline-flex rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white">Create your HRKey</Link>
            </section>
          </main>
        ) : null}
      </div>
    </div>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      {title ? <h2 className="mb-3 text-lg font-semibold text-slate-900">{title}</h2> : null}
      {children}
    </section>
  );
}

function ChipRow({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-sm text-slate-600">No strength tags published yet.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span key={item} className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">{item}</span>
      ))}
    </div>
  );
}

function StackedChips({ heading, items }: { heading: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{heading}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={`${heading}-${item}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">{item}</span>
        ))}
      </div>
    </div>
  );
}

function ScoreChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-teal-100 bg-teal-50 px-2 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-700">{label}</p>
      <p className="text-sm font-bold text-slate-900">{value}</p>
    </div>
  );
}
