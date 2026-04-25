import { apiGet, apiPost } from "@/lib/apiClient";
import { supabase } from "@/lib/supabaseClient";

export type ReferenceRequestLifecycleStatus = "Pending" | "Partial" | "Completed" | "Expired";

export interface CandidateReferenceRequest {
  id: string;
  refereeName: string;
  refereeEmail: string;
  relationship: string;
  company: string;
  role: string;
  requestedAt: string;
  status: ReferenceRequestLifecycleStatus;
  referenceLink: string | null;
}

export interface CreateReferenceRequestInput {
  candidateId: string;
  refereeName: string;
  refereeEmail: string;
  relationship: string;
  companyWorkedTogether: string;
  optionalMessage?: string;
  profileExperienceId?: string;
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
  expires_at: string | null;
  metadata: {
    relationship?: string;
    company?: string;
    role?: string;
    optional_message?: string;
  } | null;
  profile_experience_id?: string | null;
};

type ProfileExperienceRow = {
  id: string;
  title: string | null;
  company: string | null;
};

const toLifecycleStatus = (rawStatus: string | null | undefined): ReferenceRequestLifecycleStatus => {
  const value = (rawStatus || "").toLowerCase();
  if (value === "completed") return "Completed";
  if (value === "processing") return "Partial";
  if (value === "expired" || value === "cancelled") return "Expired";
  return "Pending";
};

const resolveLinkFromResponse = (payload: RequestCreationApiResponse) =>
  payload.verifyUrl || payload.verification_url || payload.reference_link || payload.link || payload.url || null;

export async function createReferenceRequest(input: CreateReferenceRequestInput) {
  const payload = {
    candidate_id: input.candidateId,
    referee_email: input.refereeEmail,
    message: input.refereeName,
    profile_experience_id: input.profileExperienceId,
    metadata: {
      relationship: input.relationship,
      company: input.companyWorkedTogether,
      optional_message: input.optionalMessage || "",
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

  const { data } = await supabase
    .from("profile_experiences")
    .select("id, title, company")
    .in("id", profileIds);

  const rows = (data || []) as ProfileExperienceRow[];
  return new Map(rows.map((row) => [row.id, row]));
}

async function fetchViaSupabase(candidateId: string): Promise<CandidateReferenceRequest[]> {
  const { data, error } = await supabase
    .from("reference_invites")
    .select("id, referee_name, referee_email, status, created_at, expires_at, metadata, profile_experience_id")
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
    return {
      id: row.id,
      refereeName: row.referee_name || "Unknown referee",
      refereeEmail: row.referee_email || "—",
      relationship: row.metadata?.relationship || "colleague",
      company: row.metadata?.company || experience?.company || "—",
      role: row.metadata?.role || experience?.title || "Reference request",
      requestedAt: row.created_at,
      status: toLifecycleStatus(row.status),
      referenceLink: null,
    };
  });
}

export async function fetchCandidateReferenceRequests(candidateId: string): Promise<CandidateReferenceRequest[]> {
  const apiCandidates = [
    "/api/references/requests",
    "/api/references/my-requests",
    "/api/reference/requests",
  ];

  for (const path of apiCandidates) {
    try {
      const response = await apiGet<{ requests?: CandidateReferenceRequest[] }>(path);
      if (Array.isArray(response?.requests)) {
        return response.requests;
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
    verified: rows.filter((row) => row.status === "Completed").length,
  };
}
