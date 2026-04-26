import { apiGet, apiPost } from "@/lib/apiClient";
import { supabase } from "@/lib/supabaseClient";

export type ReferenceRequestLifecycleStatus = "pending" | "opened" | "started" | "completed" | "expired";

export interface CandidateReferenceRequest {
  id: string;
  refereeName: string;
  refereeEmail: string;
  relationship: string;
  company: string;
  role: string;
  requestedAt: string;
  sentAt: string;
  openedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  expiredAt: string | null;
  status: ReferenceRequestLifecycleStatus;
  referenceLink: string | null;
}

export interface ReferenceGoal {
  description: string;
  kpis: string[];
}

export interface CreateReferenceRequestInput {
  candidateId: string;
  refereeName: string;
  refereeEmail: string;
  relationship: string;
  companyWorkedTogether: string;
  optionalMessage?: string;
  profileExperienceId?: string;
  goals?: ReferenceGoal[];
  focusAreas?: string[];
}

type RequestCreationApiResponse = {
  ok?: boolean;
  success?: boolean;
  reference_id?: string;
  referenceId?: string;
  verifyUrl?: string;
  verification_url?: string;
  reference_link?: string;
  link?: string;
  url?: string;
};

type ReferenceInviteRow = {
  id: string;
  referee_name: string | null;
  referee_email: string | null;
  status: string | null;
  created_at: string;
  sent_at?: string | null;
  opened_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  expired_at?: string | null;
  expires_at: string | null;
  metadata: {
    relationship?: string;
    company?: string;
    role?: string;
    optional_message?: string;
    goals?: ReferenceGoal[];
    focus_areas?: string[];
    selected_experience_id?: string;
    referee_name?: string;
  } | null;
  profile_experience_id?: string | null;
};

type ProfileExperienceRow = {
  id: string;
  title: string | null;
  company: string | null;
};

const statusPriority: ReferenceRequestLifecycleStatus[] = ["completed", "started", "opened", "expired", "pending"];

export const toLifecycleStatus = (row: {
  status?: string | null;
  openedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  expiredAt?: string | null;
  expiresAt?: string | null;
}): ReferenceRequestLifecycleStatus => {
  const raw = (row.status || "").toLowerCase();
  const now = Date.now();
  const isExpiredByDate = Boolean(row.expiresAt && new Date(row.expiresAt).getTime() < now && !row.completedAt);

  const derived: ReferenceRequestLifecycleStatus[] = [];
  if (raw === "completed" || row.completedAt) derived.push("completed");
  if (raw === "started" || raw === "processing" || row.startedAt) derived.push("started");
  if (raw === "opened" || raw === "viewed" || row.openedAt) derived.push("opened");
  if (raw === "expired" || raw === "cancelled" || row.expiredAt || isExpiredByDate) derived.push("expired");
  derived.push("pending");

  return statusPriority.find((status) => derived.includes(status)) || "pending";
};

const resolveLinkFromResponse = (payload: RequestCreationApiResponse) =>
  payload.verifyUrl || payload.verification_url || payload.reference_link || payload.link || payload.url || null;

export async function createReferenceRequest(input: CreateReferenceRequestInput) {
  const payload = {
    candidate_id: input.candidateId,
    referee_email: input.refereeEmail,
    message: input.optionalMessage || "",
    profile_experience_id: input.profileExperienceId,
    metadata: {
      relationship: input.relationship,
      company: input.companyWorkedTogether,
      optional_message: input.optionalMessage || "",
      referee_name: input.refereeName,
      focus_areas: input.focusAreas || [],
      goals: input.goals || [],
      selected_experience_id: input.profileExperienceId || null,
    },
  };

  const response = await apiPost<RequestCreationApiResponse>("/api/references/request", payload);

  return {
    ok: Boolean(response.ok ?? response.success ?? true),
    referenceId: response.reference_id || response.referenceId || null,
    referenceLink: resolveLinkFromResponse(response),
  };
}

async function fetchProfileExperienceMap(profileIds: string[]) {
  if (profileIds.length === 0) return new Map<string, ProfileExperienceRow>();

  const { data } = await supabase.from("profile_experiences").select("id, title, company").in("id", profileIds);

  const rows = (data || []) as ProfileExperienceRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

async function fetchViaSupabase(candidateId: string): Promise<CandidateReferenceRequest[]> {
  const { data, error } = await supabase
    .from("reference_invites")
    .select(
      "id, referee_name, referee_email, status, created_at, sent_at, opened_at, started_at, completed_at, expired_at, expires_at, metadata, profile_experience_id"
    )
    .eq("requester_id", candidateId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data || []) as ReferenceInviteRow[];
  const experienceMap = await fetchProfileExperienceMap(
    rows.map((row) => row.profile_experience_id).filter((id): id is string => Boolean(id))
  );

  return rows.map((row) => {
    const experience = row.profile_experience_id ? experienceMap.get(row.profile_experience_id) : undefined;
    const sentAt = row.sent_at || row.created_at;

    return {
      id: row.id,
      refereeName: row.referee_name || row.metadata?.referee_name || "Unknown referee",
      refereeEmail: row.referee_email || "—",
      relationship: row.metadata?.relationship || "Colleague",
      company: row.metadata?.company || experience?.company || "—",
      role: row.metadata?.role || experience?.title || "Reference request",
      requestedAt: sentAt,
      sentAt,
      openedAt: row.opened_at || null,
      startedAt: row.started_at || null,
      completedAt: row.completed_at || null,
      expiredAt: row.expired_at || row.expires_at || null,
      status: toLifecycleStatus({
        status: row.status,
        openedAt: row.opened_at,
        startedAt: row.started_at,
        completedAt: row.completed_at,
        expiredAt: row.expired_at,
        expiresAt: row.expires_at,
      }),
      referenceLink: null,
    };
  });
}

export async function fetchCandidateReferenceRequests(candidateId: string): Promise<CandidateReferenceRequest[]> {
  const apiCandidates = ["/api/references/requests", "/api/references/my-requests", "/api/reference/requests"];

  for (const path of apiCandidates) {
    try {
      const response = await apiGet<{ requests?: CandidateReferenceRequest[] }>(path);
      if (Array.isArray(response?.requests)) {
        return response.requests.map((row) => ({
          ...row,
          sentAt: row.sentAt || row.requestedAt,
          status: toLifecycleStatus({
            status: row.status,
            openedAt: row.openedAt,
            startedAt: row.startedAt,
            completedAt: row.completedAt,
            expiredAt: row.expiredAt,
          }),
        }));
      }
    } catch {
      // fallback chain
    }
  }

  return fetchViaSupabase(candidateId);
}

export function calculateReferenceMetrics(rows: Array<{ status: ReferenceRequestLifecycleStatus }>) {
  return {
    requested: rows.length,
    verified: rows.filter((row) => row.status === "completed").length,
  };
}
