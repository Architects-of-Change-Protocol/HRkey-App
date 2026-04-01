"use client";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { apiPost } from "@/lib/apiClient";

type ProfileExperience = {
  id: string;
  title: string | null;
  company: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean | null;
};

export default function InvitesPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [days, setDays] = useState(7);
  const [link, setLink] = useState("");
  const [experiences, setExperiences] = useState<ProfileExperience[]>([]);
  const [selectedExperienceId, setSelectedExperienceId] = useState("");
  const [loadingExperiences, setLoadingExperiences] = useState(true);
  const [experienceError, setExperienceError] = useState("");

  useEffect(() => {
    (async () => {
      setLoadingExperiences(true);
      setExperienceError("");
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;

      if (!userId) {
        setExperiences([]);
        setLoadingExperiences(false);
        setExperienceError("Sign in to request a reference.");
        return;
      }

      const { data, error } = await supabase
        .from("profile_experiences")
        .select("id, title, company, start_date, end_date, is_current")
        .eq("profile_id", userId)
        .order("sort_order", { ascending: true });

      if (error) {
        setExperiences([]);
        setExperienceError(error.message);
      } else {
        const rows = (data ?? []) as ProfileExperience[];
        setExperiences(rows);
        if (rows.length > 0) {
          setSelectedExperienceId(rows[0].id);
        }
      }
      setLoadingExperiences(false);
    })();
  }, []);

  const hasExperiences = experiences.length > 0;

  const selectedExperienceLabel = useMemo(() => {
    const selected = experiences.find((exp) => exp.id === selectedExperienceId);
    if (!selected) return "";
    return `${selected.title || "Untitled role"} at ${selected.company || "Unknown company"}`;
  }, [experiences, selectedExperienceId]);

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    setLink("");
    if (!hasExperiences) {
      return alert("Complete your profile experience first before requesting a reference.");
    }
    if (!selectedExperienceId) {
      return alert("Select an experience for this reference request.");
    }

    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        alert("You must be signed in.");
        return;
      }

      const data = await apiPost<{ ok: boolean; reference_id: string }>("/api/references/request", {
        candidate_id: userId,
        referee_email: email,
        message: name || undefined,
        profile_experience_id: selectedExperienceId,
      });

      if (!data.ok) {
        return alert("No se pudo crear la invitación");
      }
      setLink(`Request created: ${data.reference_id}`);
    } catch (error: any) {
      alert(error?.message || "Error creando invitación");
    }
  }

  return (
    <div className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Crear invitación</h1>
      {loadingExperiences && <p className="text-sm text-slate-600">Loading experiences…</p>}
      {experienceError && <p className="text-sm text-red-600">Error: {experienceError}</p>}
      {!loadingExperiences && !hasExperiences && !experienceError && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Complete your profile experience first before requesting a reference.
        </div>
      )}

      <form onSubmit={createInvite} className="grid gap-3">
        <label>Which experience is this reference for?</label>
        <select
          className="border rounded p-2"
          value={selectedExperienceId}
          onChange={(e) => setSelectedExperienceId(e.target.value)}
          disabled={!hasExperiences}
          required
        >
          {experiences.map((experience) => (
            <option key={experience.id} value={experience.id}>
              {(experience.title || "Untitled role") +
                " — " +
                (experience.company || "Unknown company") +
                (experience.start_date || experience.end_date
                  ? ` (${experience.start_date || "?"} - ${experience.is_current ? "Present" : (experience.end_date || "?")})`
                  : "")}
            </option>
          ))}
        </select>

        <label>Email del referente (opcional)</label>
        <input className="border rounded p-2" value={email} onChange={(e) => setEmail(e.target.value)} />

        <label>Nombre del referente (opcional)</label>
        <input className="border rounded p-2" value={name} onChange={(e) => setName(e.target.value)} />

        <label>Días de validez</label>
        <input
          type="number"
          className="border rounded p-2"
          value={days}
          min={1}
          max={60}
          onChange={(e) => setDays(Number(e.target.value))}
        />

        <button className="px-4 py-2 rounded-xl border shadow w-fit" disabled={!hasExperiences}>
          Request reference
        </button>
      </form>

      {link && (
        <div className="mt-4 p-3 border rounded">
          <div className="font-medium">Reference request created</div>
          <p className="text-sm text-slate-700">{selectedExperienceLabel}</p>
          <p className="text-sm break-all">{link}</p>
        </div>
      )}
    </div>
  );
}
