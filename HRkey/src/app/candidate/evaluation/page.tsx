"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { apiGet, apiPost } from "@/lib/apiClient";
import ConsentAuthorizationModal from "@/components/consent/ConsentAuthorizationModal";
import PermissionStatusCard from "@/components/consent/PermissionStatusCard";
import AocWalletSummaryCard from "@/components/aoc-wallet/AocWalletSummaryCard";
import AocEarningsCard from "@/components/aoc-wallet/AocEarningsCard";
import AocTransactionList from "@/components/aoc-wallet/AocTransactionList";
import RlusdConversionCard from "@/components/aoc-wallet/RlusdConversionCard";
import type {
  AocEarningsSummary,
  AocTransaction,
  AocConversionRequest,
} from "@/components/aoc-wallet/types";

type ReferenceAnswer = {
  questionId: string;
  cleanedText: string;
  exaggerationFlag: boolean;
  positivityFlag: boolean;
  negativityFlag: boolean;
  impactSignal: number;
  reliabilitySignal: number;
  communicationSignal: number;
};

type AggregatedSignals = {
  teamImpact: number;
  reliability: number;
  communication: number;
};

type CandidateEvaluationResponse = {
  userId: string;
  scoring: {
    referenceAnalysis: {
      answers: ReferenceAnswer[];
      aggregatedSignals: AggregatedSignals;
    };
    hrScoreResult: {
      normalizedScore: number;
      hrScore: number;
    };
    pricingResult: {
      normalizedScore: number;
      priceUsd: number;
    };
  };
};

type PublicIdentifierResponse = {
  userId: string;
  identifier: string;
  handle: string | null;
  isPublicProfile: boolean;
};

const ENV_API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_BACKEND_PUBLIC_URL ||
  "";

const ENV_APP_BASE =
  process.env.NEXT_PUBLIC_APP_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_FRONTEND_URL ||
  "";

const normalizeBase = (base: string) => base.replace(/\/$/, "");

const resolveApiBase = () => {
  if (ENV_API_BASE) return normalizeBase(ENV_API_BASE);
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    const isLocal =
      origin.includes("localhost:3000") || origin.includes("127.0.0.1:3000");
    return normalizeBase(isLocal ? "http://localhost:3001" : origin);
  }
  return "http://localhost:3001";
};

const resolveAppBase = () => {
  if (ENV_APP_BASE) return normalizeBase(ENV_APP_BASE);
  if (typeof window !== "undefined") return normalizeBase(window.location.origin);
  return normalizeBase(ENV_API_BASE || "http://localhost:3000");
};

const formatCurrency = (value: number | undefined) =>
  value === undefined
    ? "—"
    : value.toLocaleString("en-US", { style: "currency", currency: "USD" });

const truncateText = (text: string, max = 160) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

export default function CandidateEvaluationPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<CandidateEvaluationResponse | null>(
    null
  );
  const [publicIdentifier, setPublicIdentifier] = useState<string | null>(null);
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [recruiterUserId, setRecruiterUserId] = useState("");
  const [recruiterName, setRecruiterName] = useState("Recruiter");
  const [companyName, setCompanyName] = useState("Empresa solicitante");
  const [selectedDurationDays, setSelectedDurationDays] = useState(30);
  const [isConsentOpen, setIsConsentOpen] = useState(false);
  const [grantFeedback, setGrantFeedback] = useState<string | null>(null);
  const [grants, setGrants] = useState<
    Array<{
      id: string;
      recruiter_user_id: string;
      status: "active" | "expired" | "revoked";
      expires_at?: string | null;
      metadata?: { permissions?: string[] } | null;
    }>
  >([]);
  const [aocBalance, setAocBalance] = useState(0);
  const [aocTransactions, setAocTransactions] = useState<AocTransaction[]>([]);
  const [aocSummary, setAocSummary] = useState<AocEarningsSummary | null>(null);
  const [conversionRequests, setConversionRequests] = useState<AocConversionRequest[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        setIdentifierError(null);
        setPublicIdentifier(null);
        setCopyState("idle");

        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();
        if (sessionError || !sessionData.session || !sessionData.session.user) {
          setError("Please sign in to view your evaluation.");
          setLoading(false);
          return;
        }

        const accessToken = sessionData.session.access_token;
        const userId = sessionData.session.user.id;
        const baseUrl = resolveApiBase();
        const headers = { Authorization: `Bearer ${accessToken}` };

        const fetchJson = async <T,>(url: string) => {
          const res = await fetch(url, { headers });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || "Unable to load this data right now.");
          }
          return (await res.json()) as T;
        };

        const evaluationUrl = `${baseUrl}/api/candidates/${userId}/evaluation`;
        const identifierUrl = `${baseUrl}/api/me/public-identifier`;

        const [evaluationResult, identifierResult] = await Promise.allSettled([
          fetchJson<CandidateEvaluationResponse>(evaluationUrl),
          fetchJson<PublicIdentifierResponse>(identifierUrl),
        ]);

        if (evaluationResult.status === "rejected") {
          throw evaluationResult.reason;
        }

        setEvaluation(evaluationResult.value);

        if (identifierResult.status === "fulfilled") {
          setPublicIdentifier(identifierResult.value.identifier);
        } else {
          setIdentifierError(
            (identifierResult as PromiseRejectedResult)?.reason?.message ||
              "Public link unavailable."
          );
        }
      } catch (err: any) {
        console.error("Failed to load candidate evaluation", err);
        setError(err?.message || "Unexpected error loading evaluation.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const loadPermissionGrants = async () => {
    try {
      const result = await apiGet<{
        ok: boolean;
        grants: Array<{
          id: string;
          recruiter_user_id: string;
          status: "active" | "expired" | "revoked";
          expires_at?: string | null;
          metadata?: { permissions?: string[] } | null;
        }>;
      }>("/api/reference-access/grants");
      setGrants(result.grants || []);
    } catch (err) {
      console.error("Unable to load permission grants", err);
    }
  };

  useEffect(() => {
    loadPermissionGrants();
  }, []);

  const trackWalletEvent = async (
    eventName:
      | "wallet_viewed"
      | "earnings_viewed"
      | "rlusd_conversion_cta_clicked"
      | "rlusd_quote_requested"
      | "rlusd_conversion_requested"
      | "rlusd_conversion_confirmed"
      | "rlusd_conversion_failed"
  ) => {
    const payload = {
      event: eventName,
      context: "candidate_wallet",
      timestamp: new Date().toISOString(),
    };

    try {
      await apiPost("/api/analytics/events", payload);
    } catch (error) {
      console.info("Wallet analytics fallback", payload, error);
    }
  };

  useEffect(() => {
    const loadWallet = async () => {
      try {
        const [balanceResponse, transactionsResponse, summaryResponse, conversionsResponse] =
          await Promise.all([
            apiGet<{
              ok: boolean;
              balance: number;
            }>("/api/aoc/balance"),
            apiGet<{
              ok: boolean;
              transactions: AocTransaction[];
            }>("/api/aoc/transactions"),
            apiGet<{
              ok: boolean;
              summary: AocEarningsSummary;
            }>("/api/aoc/earnings-summary"),
            apiGet<{
              ok: boolean;
              requests: AocConversionRequest[];
            }>("/api/aoc/convert/requests"),
          ]);

        setAocBalance(Number(balanceResponse?.balance || 0));
        setAocTransactions(transactionsResponse?.transactions || []);
        setAocSummary(summaryResponse?.summary || null);
        setConversionRequests(conversionsResponse?.requests || []);
      } catch (err) {
        console.error("Unable to load AOC wallet data", err);
        setAocBalance(0);
        setAocTransactions([]);
        setAocSummary(null);
        setConversionRequests([]);
      }
    };

    loadWallet();
    trackWalletEvent("wallet_viewed");
    trackWalletEvent("earnings_viewed");
  }, []);

  const hrScore = evaluation?.scoring.hrScoreResult.hrScore ?? 0;
  const pricing = evaluation?.scoring.pricingResult.priceUsd ?? 10;
  const aggregated = evaluation?.scoring.referenceAnalysis.aggregatedSignals || {
    teamImpact: 0,
    reliability: 0,
    communication: 0,
  };

  const profileLabel = useMemo(() => {
    if (hrScore >= 80) return "High-impact profile";
    if (hrScore >= 60) return "Strong profile";
    return "Growing profile";
  }, [hrScore]);

  const answers = evaluation?.scoring.referenceAnalysis.answers ?? [];
  const appBase = useMemo(() => resolveAppBase(), []);
  const publicProfileUrl = useMemo(() => {
    const identifier = publicIdentifier || evaluation?.userId;
    if (!identifier) return "";
    return `${appBase}/p/${identifier}`;
  }, [appBase, publicIdentifier, evaluation?.userId]);

  const handleCopyLink = async () => {
    if (!publicProfileUrl) return;
    try {
      await navigator.clipboard.writeText(publicProfileUrl);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 2000);
    } catch (err) {
      console.error("Failed to copy link", err);
      setCopyState("idle");
    }
  };

  const trackConsentEvent = async (eventName: "consent_viewed" | "consent_approved" | "consent_rejected") => {
    const payload = {
      event: eventName,
      context: "candidate_evaluation",
      recruiterUserId: recruiterUserId || null,
      durationDays: selectedDurationDays,
      timestamp: new Date().toISOString(),
    };

    try {
      await apiPost("/api/analytics/events", payload);
    } catch (error) {
      console.info("Consent analytics fallback", payload, error);
    }
  };

  const openConsentModal = async () => {
    if (!recruiterUserId.trim()) {
      setGrantFeedback("Ingresa primero el ID del reclutador para autorizar acceso.");
      return;
    }
    setGrantFeedback(null);
    setIsConsentOpen(true);
    await trackConsentEvent("consent_viewed");
  };

  const handleApproveConsent = async () => {
    const expiresAt = new Date(Date.now() + selectedDurationDays * 24 * 60 * 60 * 1000).toISOString();
    await apiPost("/api/reference-access/grants", {
      recruiterUserId: recruiterUserId.trim(),
      expiresAt,
      notes: `Autorización desde Wallet UX (${selectedDurationDays} días)`,
    });

    await trackConsentEvent("consent_approved");
    setIsConsentOpen(false);
    setGrantFeedback("Acceso autorizado correctamente.");
    await loadPermissionGrants();
  };

  const handleRejectConsent = async () => {
    await trackConsentEvent("consent_rejected");
    setIsConsentOpen(false);
    setGrantFeedback("No se otorgó acceso.");
  };

  const renderSignalBar = (label: string, value: number) => (
    <div className="space-y-1">
      <div className="flex justify-between text-sm text-slate-700">
        <span>{label}</span>
        <span className="font-semibold">{Math.round(value * 100)}%</span>
      </div>
      <div className="h-2 rounded bg-slate-200">
        <div
          className="h-2 rounded bg-indigo-500"
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Your HRKey Evaluation</h1>
          <p className="text-slate-600 text-sm mt-1">
            Based on your verified references and profile signals.
          </p>
        </div>
        <a
          href="/candidate/network"
          className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm shadow-sm bg-white hover:bg-slate-50"
        >
          View relationship network
        </a>
      </div>

      {loading && (
        <div className="rounded-lg border p-4 bg-white shadow-sm">
          Loading your evaluation…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && evaluation && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-slate-600">HRKey Score</div>
              <div className="mt-2 text-4xl font-bold text-slate-900">
                {Math.round(hrScore)}
              </div>
              <div className="mt-1 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">
                {profileLabel}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <div className="text-sm text-slate-600">Suggested access price</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {formatCurrency(pricing)}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Based on your references and performance signals.
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Your public HRKey profile</h2>
                <p className="text-sm text-slate-600">
                  Share this link on your CV, LinkedIn, or with recruiters to
                  highlight your HRKey Score and value.
                </p>
              </div>
              <button
                disabled={!publicProfileUrl}
                onClick={handleCopyLink}
                className="px-3 py-2 text-sm rounded-lg border bg-indigo-600 text-white shadow-sm disabled:opacity-50"
              >
                {copyState === "copied" ? "Copied" : "Copy link"}
              </button>
            </div>
            <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-800 flex items-center justify-between">
              <span className="truncate mr-3">
                {publicProfileUrl || "Public link unavailable"}
              </span>
            </div>
            {identifierError && (
              <p className="text-xs text-amber-700">{identifierError}</p>
            )}
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Autorizar acceso a tu perfil</h2>
              <span className="text-xs text-slate-500">Firma de permiso</span>
            </div>
            <p className="text-sm text-slate-600">
              Estás dando acceso a tu información bajo condiciones específicas. Puedes revocarlo cuando quieras.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="text-sm text-slate-700">
                ID del reclutador
                <input
                  value={recruiterUserId}
                  onChange={(event) => setRecruiterUserId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                  placeholder="uuid del reclutador"
                />
              </label>
              <label className="text-sm text-slate-700">
                Duración
                <select
                  value={selectedDurationDays}
                  onChange={(event) => setSelectedDurationDays(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                >
                  <option value={7}>7 días</option>
                  <option value={30}>30 días</option>
                  <option value={90}>90 días</option>
                </select>
              </label>
              <label className="text-sm text-slate-700">
                Nombre del reclutador (opcional)
                <input
                  value={recruiterName}
                  onChange={(event) => setRecruiterName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
              <label className="text-sm text-slate-700">
                Empresa (opcional)
                <input
                  value={companyName}
                  onChange={(event) => setCompanyName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </label>
            </div>

            <button
              onClick={openConsentModal}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Dar acceso
            </button>

            {grantFeedback ? (
              <p className="text-sm text-indigo-700">{grantFeedback}</p>
            ) : null}
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
            <h2 className="text-lg font-semibold">Estado de permisos</h2>
            {grants.length === 0 ? (
              <p className="text-sm text-slate-600">Todavía no tienes permisos activos o históricos.</p>
            ) : (
              <div className="space-y-3">
                {grants.map((grant) => (
                  <PermissionStatusCard
                    key={grant.id}
                    status={grant.status}
                    expiresAt={grant.expires_at || null}
                    permissions={grant.metadata?.permissions || ["read_references"]}
                    recruiterUserId={grant.recruiter_user_id}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Tu wallet AOC</h2>
              <span className="text-xs text-slate-500">Tus permisos e ingresos</span>
            </div>
            <p className="text-sm text-slate-600">
              Tus permisos verificables pueden generarte ingresos cuando empresas acceden a tu perfil.
            </p>
            <AocWalletSummaryCard balance={aocBalance} />
            <AocEarningsCard summary={aocSummary} />
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-slate-900">Historial de transacciones</h3>
              <AocTransactionList
                userId={evaluation.userId}
                transactions={aocTransactions}
              />
            </div>
            <RlusdConversionCard
              balance={aocBalance}
              requests={conversionRequests}
              onRequestCreated={({ request, balanceAfterDebit }) => {
                setAocBalance(balanceAfterDebit);
                setConversionRequests((current) => [request, ...current.filter((row) => row.id !== request.id)]);
                trackWalletEvent("rlusd_conversion_confirmed");
              }}
              onIntent={() => {
                trackWalletEvent("rlusd_conversion_cta_clicked");
              }}
              onQuoteRequested={() => trackWalletEvent("rlusd_quote_requested")}
              onConversionRequested={() => trackWalletEvent("rlusd_conversion_requested")}
              onConversionFailed={() => trackWalletEvent("rlusd_conversion_failed")}
            />
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Pricing preview</h2>
              <span className="text-xs text-slate-500">
                For your reference pack
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg border bg-slate-50 p-4 shadow-sm">
                <div className="text-sm text-slate-600">Estimated access price</div>
                <div className="mt-2 text-2xl font-bold text-slate-900">
                  {formatCurrency(pricing)}
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  Based on your HRKey Score and verified reference signals.
                </p>
              </div>

              <div className="rounded-lg border bg-slate-50 p-4 shadow-sm space-y-2">
                <div className="text-sm font-semibold text-slate-700">
                  How pricing works
                </div>
                <p className="text-sm text-slate-600">
                  Pricing is set in USDC only and reflects demand, rarity, and
                  operational context for your role and location.
                </p>
                <p className="text-xs text-slate-600">
                  No tokens, revenue splits, or staking payouts are involved.
                </p>
              </div>

              <div className="rounded-lg border bg-slate-50 p-4 shadow-sm space-y-2">
                <div className="text-sm font-semibold text-slate-700">
                  Your control
                </div>
                <p className="text-sm text-slate-600">
                  Companies can only access reference packs after you approve
                  their request.
                </p>
                <p className="text-xs text-slate-600">
                  You can revoke or expire access at any time.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Aggregated signals</h2>
              <span className="text-xs text-slate-500">0% = low, 100% = high</span>
            </div>
            <div className="space-y-3">
              {renderSignalBar("Team impact", aggregated.teamImpact)}
              {renderSignalBar("Reliability", aggregated.reliability)}
              {renderSignalBar("Communication", aggregated.communication)}
            </div>
          </div>

          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Reference summaries</h2>
              <span className="text-sm text-slate-600">
                {answers.length} reference{answers.length === 1 ? "" : "s"}
              </span>
            </div>

            {answers.length === 0 && (
              <p className="text-sm text-slate-600">No references available yet.</p>
            )}

            <div className="space-y-3">
              {answers.map((answer, index) => (
                <div
                  key={`${answer.questionId}-${index}`}
                  className="rounded-lg border p-4 bg-slate-50"
                >
                  <div className="flex items-center justify-between text-sm text-slate-700">
                    <span className="font-semibold">
                      {answer.questionId || `Reference #${index + 1}`}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-800 leading-relaxed">
                    {truncateText(answer.cleanedText || "(No response)")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    {answer.positivityFlag && (
                      <span className="rounded-full bg-green-100 text-green-700 px-3 py-1">
                        Positive
                      </span>
                    )}
                    {answer.negativityFlag && (
                      <span className="rounded-full bg-amber-100 text-amber-700 px-3 py-1">
                        Contains concerns
                      </span>
                    )}
                    {answer.exaggerationFlag && (
                      <span className="rounded-full bg-sky-100 text-sky-700 px-3 py-1">
                        Exaggerated tone
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConsentAuthorizationModal
        isOpen={isConsentOpen}
        recruiterName={recruiterName}
        companyName={companyName}
        dataTypes={["Referencias", "Insights"]}
        permissions={["read_references", "generate_insight"]}
        duration={`${selectedDurationDays} días`}
        candidateName="Candidato HRKey"
        profileSummary="Compartirás tu pack de referencias y señales agregadas con acceso controlado."
        estimatedCostAOC={null}
        onClose={() => setIsConsentOpen(false)}
        onReject={handleRejectConsent}
        onAuthorize={handleApproveConsent}
      />
    </div>
  );
}
