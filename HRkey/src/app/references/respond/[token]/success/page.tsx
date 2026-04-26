"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { apiGet } from "@/lib/apiClient";

type InviteMetadata = {
  relationship?: string;
  relationship_type?: string;
};

type InviteRow = {
  referee_email: string | null;
  metadata?: InviteMetadata | null;
};

type ValueContent = {
  headline: string;
  subcopy: string;
  bullets: string[];
};

const sectionCardStyle: CSSProperties = {
  background: "#ffffff",
  borderRadius: 18,
  padding: 20,
  border: "1px solid #e2e8f0",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.04)",
};

const fadeCardStyle = (delay: number): CSSProperties => ({
  ...sectionCardStyle,
  animation: `fade-in-up 520ms ease ${delay}ms both`,
});

const resolveRelationshipContent = (relationship: string): ValueContent => {
  const normalized = relationship.trim().toLowerCase();

  if (normalized.includes("manager") || normalized.includes("lead")) {
    return {
      headline: "Do you lead people?",
      subcopy: "Great managers are constantly asked about strong team members.",
      bullets: [
        "Reuse references for recurring employees",
        "Save time responding to recruiters",
        "Build your verified leadership reputation",
        "Get paid when companies request premium access to your insights",
      ],
    };
  }

  if (normalized.includes("peer") || normalized.includes("colleague") || normalized.includes("coworker")) {
    return {
      headline: "Your credibility has value",
      subcopy: "Your trusted perspective can keep working for you over time.",
      bullets: [
        "Store references once",
        "Reuse them instantly",
        "Build verified trust capital",
        "Strengthen your own profile",
      ],
    };
  }

  if (normalized.includes("client") || normalized.includes("customer")) {
    return {
      headline: "Your experience matters",
      subcopy: "Great client insights can become long-term professional assets.",
      bullets: [
        "Verify top vendors and talent",
        "Reuse recommendations easily",
        "Build authority in your industry",
        "Earn through premium consultations later",
      ],
    };
  }

  return {
    headline: "Turn one reference into long-term value",
    subcopy: "A free HRKey account helps you keep trusted recommendations organized and reusable.",
    bullets: [
      "Save your professional references in one secure profile",
      "Reuse verified references when new requests arrive",
      "Share only when you approve",
      "Build compounding trust over time",
    ],
  };
};

export default function ReferenceSuccessPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token || "";

  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStickyCta, setShowStickyCta] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    const loadInvite = async () => {
      try {
        const response = await apiGet<{ success: boolean; invite: InviteRow }>(`/api/reference/by-token/${encodeURIComponent(token)}`, {
          auth: false,
        });
        setInvite(response.invite || null);
      } catch {
        setInvite(null);
      } finally {
        setLoading(false);
      }
    };

    loadInvite();
  }, [token]);

  useEffect(() => {
    const onScroll = () => {
      const halfway = window.scrollY > (document.body.scrollHeight - window.innerHeight) * 0.5;
      setShowStickyCta(halfway);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const relationship = invite?.metadata?.relationship_type || invite?.metadata?.relationship || "";
  const relationshipContent = useMemo(() => resolveRelationshipContent(relationship), [relationship]);
  const prefilledEmail = invite?.referee_email || "";

  const emailHref = prefilledEmail
    ? `/auth/signup?email=${encodeURIComponent(prefilledEmail)}&source=reference-success`
    : "/auth/signup?source=reference-success";
  const googleHref = `/auth/signup?provider=google&source=reference-success${prefilledEmail ? `&email=${encodeURIComponent(prefilledEmail)}` : ""}`;

  const handleShare = async () => {
    const shareData = {
      title: "HRKey",
      text: "Join HRKey early to build trusted professional references.",
      url: "https://hrkey.app",
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setShareStatus("Thanks for sharing HRKey.");
        return;
      }

      await navigator.clipboard.writeText(shareData.url);
      setShareStatus("Link copied. Share it with someone you trust.");
    } catch {
      setShareStatus("Sharing was cancelled.");
    }
  };

  return (
    <main style={{ background: "#f8fafc", minHeight: "100vh", color: "#0f172a", paddingBottom: 110 }}>
      <style>{`
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse-check {
          0% { transform: scale(1); }
          50% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
      `}</style>

      <header style={{ background: "#0f172a", color: "#fff", padding: "14px 16px", fontWeight: 700 }}>HRKey</header>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: 16, display: "grid", gap: 14 }}>
        <section style={fadeCardStyle(40)}>
          <div
            style={{
              width: 66,
              height: 66,
              borderRadius: 999,
              margin: "4px auto 16px",
              display: "grid",
              placeItems: "center",
              background: "#ccfbf1",
              color: "#0f766e",
              fontSize: 32,
              animation: "pulse-check 500ms ease 100ms 1 both",
            }}
          >
            ✓
          </div>
          <h1 style={{ margin: 0, textAlign: "center", fontSize: 30 }}>Reference submitted successfully</h1>
          <p style={{ margin: "12px 0 0", textAlign: "center", color: "#334155", fontSize: 17 }}>
            Thank you for helping make hiring more trustworthy.
          </p>
          <p style={{ margin: "8px 0 0", textAlign: "center", color: "#0f766e", fontWeight: 600 }}>
            Your professional insight just created real value.
          </p>
        </section>

        <section style={fadeCardStyle(120)}>
          <h2 style={{ marginTop: 0, fontSize: 22 }}>This reference can work for you again</h2>
          <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "grid", gap: 8, color: "#334155" }}>
            <li>Reuse this reference in future requests</li>
            <li>Avoid repeating the same feedback process</li>
            <li>Keep all references in one secure place</li>
            <li>Control when and how they are shared</li>
          </ul>
        </section>

        <section style={fadeCardStyle(180)}>
          <h2 style={{ marginTop: 0, fontSize: 22 }}>{relationshipContent.headline}</h2>
          <p style={{ margin: "6px 0 0", color: "#334155" }}>{relationshipContent.subcopy}</p>
          <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
            {relationshipContent.bullets.map((bullet) => (
              <div key={bullet} style={{ background: "#f1f5f9", borderRadius: 12, padding: "10px 12px", color: "#0f172a" }}>
                {bullet}
              </div>
            ))}
          </div>
        </section>

        <section style={fadeCardStyle(240)}>
          <h2 style={{ marginTop: 0, fontSize: 24 }}>Create your free HRKey account</h2>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <Link
              href={googleHref}
              style={{
                textAlign: "center",
                textDecoration: "none",
                background: "#0d9488",
                color: "#fff",
                borderRadius: 12,
                padding: "12px 14px",
                fontWeight: 700,
              }}
            >
              Continue with Google
            </Link>
            <Link
              href={emailHref}
              style={{
                textAlign: "center",
                textDecoration: "none",
                border: "1px solid #0d9488",
                color: "#0d9488",
                background: "#fff",
                borderRadius: 12,
                padding: "12px 14px",
                fontWeight: 700,
              }}
            >
              Create account with email{prefilledEmail ? ` (${prefilledEmail})` : ""}
            </Link>
            <Link href="/" style={{ textAlign: "center", color: "#475569", fontWeight: 600, textDecoration: "none", padding: "6px 0" }}>
              Maybe later
            </Link>
          </div>
          <p style={{ margin: "12px 0 0", fontSize: 13, color: "#64748b" }}>
            {loading ? "Loading your invite details…" : ""}
          </p>
        </section>

        <section style={fadeCardStyle(300)}>
          <h3 style={{ marginTop: 0, fontSize: 20 }}>Know another trusted professional?</h3>
          <p style={{ margin: "6px 0 0", color: "#334155" }}>
            Invite managers, operators, founders, and experts to join early.
          </p>
          <button
            type="button"
            onClick={handleShare}
            style={{
              marginTop: 12,
              borderRadius: 12,
              border: "1px solid #0d9488",
              color: "#0d9488",
              background: "#f0fdfa",
              padding: "10px 14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Share HRKey
          </button>
          {shareStatus && <p style={{ margin: "8px 0 0", color: "#0f766e", fontSize: 13 }}>{shareStatus}</p>}
        </section>

        <p style={{ textAlign: "center", color: "#64748b", fontSize: 13, marginTop: 2 }}>
          Your submitted reference remains valid whether or not you create an account.
        </p>
      </div>

      {showStickyCta && (
        <div
          style={{
            position: "fixed",
            left: 12,
            right: 12,
            bottom: 12,
            zIndex: 40,
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: 16,
            boxShadow: "0 16px 24px rgba(15, 23, 42, 0.14)",
            padding: 10,
            display: "grid",
            gap: 8,
            animation: "fade-in-up 300ms ease both",
          }}
        >
          <Link
            href={googleHref}
            style={{ textDecoration: "none", textAlign: "center", background: "#0d9488", color: "#fff", padding: "11px 14px", borderRadius: 10, fontWeight: 700 }}
          >
            Continue with Google
          </Link>
          <Link
            href={emailHref}
            style={{ textDecoration: "none", textAlign: "center", border: "1px solid #0d9488", color: "#0d9488", padding: "11px 14px", borderRadius: 10, fontWeight: 700 }}
          >
            Create account with email
          </Link>
        </div>
      )}
    </main>
  );
}
