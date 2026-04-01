"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { apiGet, apiPost, ApiClientError } from "../../../lib/apiClient"
import { buildReferencePayload, validateReferencePayload } from "./formLogic"

type InviteRow = {
  referee_email: string | null
  referee_name: string | null
  expires_at: string | null
  experience: {
    title: string | null
    company: string | null
    start_date: string | null
    end_date: string | null
  } | null
}

const CORE_COMPETENCIES = [
  { key: "leadership", label: "Leadership" },
  { key: "execution", label: "Execution" },
  { key: "communication", label: "Communication" },
  { key: "ownership", label: "Ownership" },
  { key: "collaboration", label: "Collaboration" },
] as const

const formatExperienceDates = (startDate: string | null, endDate: string | null) => {
  const format = (value: string | null) => {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed.getUTCFullYear().toString()
  }

  const start = format(startDate)
  const end = endDate ? format(endDate) : "Present"
  if (!start && !end) return "Dates not available"
  if (!start) return end || "Dates not available"
  return `${start} – ${end || "Present"}`
}

function VerifyReferenceContent() {
  const params = useSearchParams()
  const token = params.get("token") || ""

  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState<InviteRow | null>(null)
  const [recommendation, setRecommendation] = useState("")
  const [strengths, setStrengths] = useState("")
  const [improvements, setImprovements] = useState("")
  const [rating, setRating] = useState<number>(5)
  const [structuredRatings, setStructuredRatings] = useState<Record<string, number>>({
    leadership: 0,
    execution: 0,
    communication: 0,
    ownership: 0,
    collaboration: 0,
  })
  const [msg, setMsg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setMsg(null)

      if (!token) {
        setMsg("This invite link is invalid or expired.")
        setLoading(false)
        return
      }

      try {
        const res = await apiGet<{ success: boolean; invite: InviteRow }>(`/api/reference/by-token/${encodeURIComponent(token)}`, {
          auth: false,
        })

        setInvite(res.invite)
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 429) {
          setMsg("Too many attempts. Please try again later.")
        } else {
          setMsg("This invite link is invalid or expired.")
        }
        setLoading(false)
        return
      }

      setLoading(false)
    }

    load()
  }, [token])

  const submit = async () => {
    if (!invite || submitting) return

    const expiresNow = invite?.expires_at ? new Date(invite.expires_at) : null
    const expiredNow = expiresNow ? expiresNow.getTime() < Date.now() : false

    if (expiredNow) {
      setMsg("This invite link is invalid or expired.")
      return
    }

    const validationMessage = validateReferencePayload({
      experience: invite.experience,
      overallRating: rating,
      structuredRatings,
      recommendation,
    })

    if (validationMessage) {
      setMsg(validationMessage)
      return
    }

    const payload = buildReferencePayload({
      experience: invite.experience,
      overallRating: rating,
      structuredRatings,
      recommendation,
      strengths,
      improvements,
    })

    setSubmitting(true)
    setMsg("Submitting reference…")

    try {
      const response = await apiPost<{ ok: boolean }>(
        `/api/references/respond/${encodeURIComponent(token)}`,
        payload,
        { auth: false }
      )

      if (response.ok) {
        if (invite.experience) {
          const role = invite.experience.title || "this role"
          const company = invite.experience.company || "this company"
          setMsg(`Thank you. Your reference for ${role} at ${company} was submitted successfully.`)
        } else {
          setMsg("Thank you. Your reference was submitted successfully.")
        }
      } else {
        setMsg("This invite link is invalid or expired.")
      }
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 429) {
        setMsg("Too many attempts. Please try again later.")
        return
      }

      setMsg("This invite link is invalid or expired.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>Cargando…</div>
  }

  if (!invite) {
    return (
      <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
        <h1>Invitación inválida</h1>
        {msg && <p>{msg}</p>}
      </div>
    )
  }

  const expires = invite.expires_at ? new Date(invite.expires_at) : null
  const expired = expires ? expires.getTime() < Date.now() : false
  const disabled = expired || submitting
  const hasExperienceContext = Boolean(invite.experience)

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1>Dejar una referencia</h1>
      <p>Gracias por ayudar con una referencia verificada.</p>

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
        <div>
          <b>Para:</b> {invite.referee_name || "—"}{" "}
          {invite.referee_email ? `(${invite.referee_email})` : ""}
        </div>
        <div>
          <b>Vence:</b> {expires ? expires.toLocaleString() : "—"}
        </div>
      </div>

      {hasExperienceContext && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 8, background: "#fafafa" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#374151", textTransform: "uppercase", letterSpacing: 0.4 }}>
            You are reviewing:
          </div>
          <div style={{ marginTop: 6, fontSize: 18, fontWeight: 700 }}>
            {invite.experience?.title || "Role"} at {invite.experience?.company || "Company"}
          </div>
          <div style={{ marginTop: 4, color: "#4b5563" }}>
            {formatExperienceDates(invite.experience?.start_date || null, invite.experience?.end_date || null)}
          </div>
        </div>
      )}

      <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
        {hasExperienceContext ? (
          <>
            <div style={{ marginTop: 6, fontWeight: 600 }}>Core competencies (0–5)</div>
            {CORE_COMPETENCIES.map((competency) => (
              <label key={competency.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ minWidth: 140 }}>{competency.label}</span>
                <input
                  type="number"
                  min={0}
                  max={5}
                  value={structuredRatings[competency.key]}
                  onChange={(e) => {
                    const nextValue = Math.min(5, Math.max(0, Number(e.target.value)))
                    setStructuredRatings((prev) => ({ ...prev, [competency.key]: nextValue }))
                  }}
                />
              </label>
            ))}

            <label>How did this person perform in this role?</label>
            <textarea rows={4} value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />

            <label>What were their key strengths in this position?</label>
            <textarea rows={4} value={strengths} onChange={(e) => setStrengths(e.target.value)} />

            <label>What could they have improved in this role?</label>
            <textarea rows={4} value={improvements} onChange={(e) => setImprovements(e.target.value)} />
          </>
        ) : (
          <>
            <label>Resumen / Comentario</label>
            <textarea rows={6} value={recommendation} onChange={(e) => setRecommendation(e.target.value)} />

            <label>Calificación (1–5)</label>
            <input
              type="number"
              min={1}
              max={5}
              value={rating}
              onChange={(e) => setRating(Math.min(5, Math.max(1, Number(e.target.value))))}
            />
          </>
        )}

        <button disabled={disabled} onClick={submit}>
          {submitting ? "Submitting reference…" : "Enviar referencia"}
        </button>

        {disabled && <div style={{ color: "#b91c1c" }}>Esta invitación no está activa.</div>}
      </div>

      {msg && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 8,
            whiteSpace: "pre-wrap",
          }}
        >
          {msg}
        </div>
      )}
    </div>
  )
}

export default function VerifyReferencePage() {
  return (
    <Suspense fallback={<div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>Cargando…</div>}>
      <VerifyReferenceContent />
    </Suspense>
  )
}
