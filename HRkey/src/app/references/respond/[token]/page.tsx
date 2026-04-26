"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiGet, apiPost, ApiClientError } from "@/lib/apiClient";

type InviteMetadata = {
  relationship?: string;
  relationship_type?: string;
  focus_areas?: string[];
  goals?: Array<{ description?: string; kpis?: string[] }>;
  company?: string;
  candidate_name?: string;
  role?: string;
};

type InviteRow = {
  referee_email: string | null;
  referee_name: string | null;
  expires_at: string | null;
  experience: {
    title: string | null;
    company: string | null;
    start_date: string | null;
    end_date: string | null;
  } | null;
  metadata?: InviteMetadata | null;
};

const baseKpis = ["Revenue targets", "Conversion rate", "Pipeline management", "Client retention", "Team leadership", "Forecasting accuracy"];

const chipStyle = (active: boolean): CSSProperties => ({
  borderRadius: 999,
  border: `1px solid ${active ? "#0d9488" : "#cbd5e1"}`,
  background: active ? "#ccfbf1" : "#fff",
  color: "#0f172a",
  padding: "10px 14px",
  fontWeight: 600,
  fontSize: 14,
});

const formatDuration = (startDate: string | null, endDate: string | null) => {
  const fmt = (value: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  };

  const start = fmt(startDate);
  const end = endDate ? fmt(endDate) : "Present";
  if (!start && !end) return "Not provided";
  if (!start) return end || "Not provided";
  return `${start} – ${end || "Present"}`;
};

const applyAiTransform = (kind: string, value: string, kpis: string[]) => {
  if (kind === "clarity") return `${value}\n\nClarified summary: Focus on concise, concrete outcomes.`;
  if (kind === "objective") return `${value}\n\nObjective framing: Use observable behaviors and measurable outcomes.`;
  if (kind === "alignKpis") return `${value}\n\nKPI alignment: ${kpis.length ? `Tie examples to ${kpis.join(", ")}.` : "Tie examples to selected KPI areas."}`;
  if (kind === "constructive") return `${value}\n\nConstructive framing: Include one practical next-step for improvement.`;
  if (kind === "shorten") return value.split(/\s+/).slice(0, 70).join(" ");
  return `${value}\n\nExample expansion: Add one specific situation, action, and business result.`;
};

export default function ReferenceRespondPage() {
  const router = useRouter();
  const params = useParams<{ token: string }>();
  const token = params?.token || "";
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [kpiInput, setKpiInput] = useState("");
  const [selectedKpis, setSelectedKpis] = useState<string[]>([]);
  const [overallRating, setOverallRating] = useState<number | null>(null);
  const [goalsAnswer, setGoalsAnswer] = useState("");
  const [reliabilityRating, setReliabilityRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState("");
  const [aiUsed, setAiUsed] = useState(false);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      setLoading(true);
      setMessage(null);
      try {
        const res = await apiGet<{ success: boolean; invite: InviteRow }>(`/api/reference/by-token/${encodeURIComponent(token)}`, { auth: false });
        setInvite(res.invite);
      } catch (error) {
        setMessage(error instanceof ApiClientError && error.status === 429 ? "Too many attempts. Please try again later." : "This invite link is invalid or expired.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const suggestedKpis = useMemo(() => {
    const fromGoals = invite?.metadata?.goals?.flatMap((goal) => goal.kpis || []).filter(Boolean) || [];
    const fromFocus = invite?.metadata?.focus_areas || [];
    return Array.from(new Set([...fromGoals, ...fromFocus, ...baseKpis]));
  }, [invite]);

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (selectedKpis.length === 0) errors.push("Select at least one KPI or focus area.");
    if (!overallRating) errors.push("Select an overall performance rating.");
    if (!goalsAnswer) errors.push("Answer whether goals were consistently met.");
    if (!reliabilityRating) errors.push("Select a reliability rating.");
    if (feedback.trim().length < 80) errors.push("Written feedback must include at least 80 characters.");
    return errors;
  }, [selectedKpis, overallRating, goalsAnswer, reliabilityRating, feedback]);

  const canSubmit = validationErrors.length === 0 && !submitting;

  const toggleKpi = (kpi: string) => {
    setSelectedKpis((current) => (current.includes(kpi) ? current.filter((item) => item !== kpi) : [...current, kpi]));
  };

  const addCustomKpi = () => {
    const trimmed = kpiInput.trim();
    if (!trimmed) return;
    setSelectedKpis((current) => (current.includes(trimmed) ? current : [...current, trimmed]));
    setKpiInput("");
  };

  const applyAiHelper = (kind: string) => {
    const trimmed = feedback.trim();
    if (!trimmed) {
      setMessage("Write your feedback first so AI can improve your own words.");
      return;
    }
    setFeedback(applyAiTransform(kind, trimmed, selectedKpis));
    setAiUsed(true);
    setMessage("AI feedback coach updated your draft without adding new facts.");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!invite || !canSubmit) return;

    setSubmitting(true);
    setMessage(null);

    const relationshipContext = invite.metadata?.relationship_type || invite.metadata?.relationship || invite.metadata?.company || "Colleague";
    const payload = {
      ratings: {
        overall_performance: overallRating,
        reliability: reliabilityRating,
        ...Object.fromEntries(selectedKpis.map((kpi) => [kpi, overallRating])),
      },
      comments: {
        recommendation: feedback,
        goal_consistency: goalsAnswer,
        selected_kpis: selectedKpis,
        relationship_context: relationshipContext,
        ai_assistance_used: aiUsed,
        metadata: {
          invite_metadata: invite.metadata || null,
          experience: invite.experience || null,
        },
      },
    };

    try {
      const response = await apiPost<{ ok: boolean }>(`/api/references/respond/${encodeURIComponent(token)}`, payload, { auth: false });
      if (response.ok) {
        router.push(`/references/respond/${encodeURIComponent(token)}/success`);
        return;
      }
      setMessage("This invite link is invalid or expired.");
    } catch (error) {
      setMessage(error instanceof ApiClientError && error.status === 429 ? "Too many attempts. Please try again later." : "We could not submit this reference right now.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Loading reference invite…</div>;
  if (!invite) return <div style={{ padding: 24 }}>{message || "Invite not found."}</div>;

  const relationshipType = invite.metadata?.relationship_type || invite.metadata?.relationship || "colleague";
  const candidateName = invite.metadata?.candidate_name || "this candidate";

  return (
    <main style={{ background: "#f8fafc", minHeight: "100vh", color: "#0f172a" }}>
      <header style={{ background: "#0f172a", color: "#fff", padding: "14px 16px", fontWeight: 700 }}>Manager Referee Form</header>
      <form onSubmit={handleSubmit} style={{ maxWidth: 760, margin: "0 auto", padding: 16, display: "grid", gap: 14 }}>
        <section style={{ background: "#fff", borderRadius: 18, padding: 18 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>Provide a Reference</h1>
          <p style={{ marginBottom: 6 }}>Evaluate {candidateName} based on their performance</p>
          <small>You worked with this person as their {relationshipType}</small>
        </section>

        <section style={{ background: "#fff", borderRadius: 18, padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Position</h2>
          <p><b>Position:</b> {invite.experience?.title || invite.metadata?.role || "Not provided"}</p>
          <p><b>Company:</b> {invite.experience?.company || invite.metadata?.company || "Not provided"}</p>
          <p><b>Duration:</b> {formatDuration(invite.experience?.start_date || null, invite.experience?.end_date || null)}</p>
        </section>

        <section style={{ background: "#fff", borderRadius: 18, padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Performance Areas / KPIs</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {suggestedKpis.map((kpi) => (
              <button type="button" key={kpi} onClick={() => toggleKpi(kpi)} style={chipStyle(selectedKpis.includes(kpi))}>{kpi}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input value={kpiInput} onChange={(e) => setKpiInput(e.target.value)} placeholder="Add custom KPI" style={{ flex: 1, borderRadius: 12, border: "1px solid #cbd5e1", padding: 12 }} />
            <button type="button" onClick={addCustomKpi} style={{ borderRadius: 12, border: "none", padding: "12px 14px", background: "#0d9488", color: "white" }}>Add</button>
          </div>
        </section>

        <section style={{ background: "#fff", borderRadius: 18, padding: 18, display: "grid", gap: 12 }}>
          <h2 style={{ marginTop: 0 }}>Ratings</h2>
          <label>Overall performance rating: 1–5</label>
          <input type="range" min={1} max={5} value={overallRating || 1} onChange={(e) => setOverallRating(Number(e.target.value))} />
          <small>Below expectations → Exceeded expectations ({overallRating ?? "—"})</small>

          <label>Did this person consistently meet their performance goals?</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {["Yes, consistently", "Sometimes", "No"].map((option) => (
              <button key={option} type="button" onClick={() => setGoalsAnswer(option)} style={chipStyle(goalsAnswer === option)}>{option}</button>
            ))}
          </div>

          <label>Reliability rating: 1–5</label>
          <input type="range" min={1} max={5} value={reliabilityRating || 1} onChange={(e) => setReliabilityRating(Number(e.target.value))} />
          <small>Unreliable → Very reliable ({reliabilityRating ?? "—"})</small>
        </section>

        <section style={{ background: "#fff", borderRadius: 18, padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Required written feedback</h2>
          <p style={{ marginTop: 0 }}>HRKey AI helps you write objective, KPI-aligned feedback. Be specific, fair, and constructive.</p>
          <textarea
            required
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Describe specific examples of performance, outcomes, strengths, and areas for improvement."
            style={{ width: "100%", minHeight: 160, borderRadius: 14, border: "1px solid #cbd5e1", padding: 12 }}
          />
          <small>{feedback.trim().length}/80 minimum characters</small>

          <div style={{ marginTop: 14, background: "#ecfeff", borderRadius: 14, padding: 12 }}>
            <h3 style={{ marginTop: 0 }}>AI Feedback Coach</h3>
            <small>AI suggestions are based only on what you write.</small>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => applyAiHelper("clarity")} style={chipStyle(false)}>Improve clarity</button>
              <button type="button" onClick={() => applyAiHelper("objective")} style={chipStyle(false)}>Make more objective</button>
              <button type="button" onClick={() => applyAiHelper("alignKpis")} style={chipStyle(false)}>Align to selected KPIs</button>
              <button type="button" onClick={() => applyAiHelper("constructive")} style={chipStyle(false)}>Make feedback constructive</button>
              <button type="button" onClick={() => applyAiHelper("shorten")} style={chipStyle(false)}>Shorten</button>
              <button type="button" onClick={() => applyAiHelper("expand")} style={chipStyle(false)}>Expand with examples</button>
            </div>
          </div>
        </section>

        {validationErrors.length > 0 && (
          <section style={{ background: "#fff7ed", borderRadius: 14, padding: 12 }}>
            {validationErrors.map((error) => (
              <div key={error} style={{ color: "#9a3412" }}>• {error}</div>
            ))}
          </section>
        )}

        <button disabled={!canSubmit} type="submit" style={{ borderRadius: 14, border: "none", padding: "14px 18px", background: canSubmit ? "#0d9488" : "#94a3b8", color: "#fff", fontSize: 16, fontWeight: 700 }}>
          {submitting ? "Submitting..." : "Submit reference"}
        </button>

        <small style={{ color: "#334155" }}>Your response is securely submitted through HRKey. The candidate may choose what to share publicly, but redactions can affect confidence score.</small>
        {message && <div style={{ color: "#b91c1c" }}>{message}</div>}
        <Link href="/" style={{ color: "#0d9488", fontWeight: 700 }}>Learn about HRKey</Link>
      </form>
    </main>
  );
}
