import { apiGet } from "@/lib/apiClient";
import { supabase } from "@/lib/supabaseClient";

export type AccountType = "candidate" | "company";

type ProfileRow = {
  id: string;
  full_name?: string | null;
  title?: string | null;
  company?: string | null;
  user_type?: string | null;
  account_type?: string | null;
};

function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export async function fetchCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) throw error;
  return user;
}

export async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, title, company")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[v2-auth] profile lookup error", error);
    return null;
  }

  return (data as ProfileRow | null) ?? null;
}

export function isCandidateOnboardingComplete(profile: ProfileRow | null): boolean {
  if (!profile) return false;
  return [profile.full_name, profile.title, profile.company].every(isFilled);
}

export async function isCompanyOnboardingComplete(): Promise<boolean> {
  try {
    const result = await apiGet<{ success: boolean; companies?: Array<{ id: string }> }>("/api/companies/my");
    return Boolean(result.success && result.companies && result.companies.length > 0);
  } catch (error: any) {
    if (error?.status === 404) return false;
    console.error("[v2-auth] company onboarding lookup error", error);
    return false;
  }
}

export function resolveAccountType(params: {
  profile: ProfileRow | null;
  preferredType?: AccountType | null;
  userMetadataType?: string | null;
}): AccountType {
  const fromProfile = params.profile?.account_type ?? params.profile?.user_type;
  const raw = fromProfile || params.userMetadataType || params.preferredType;
  return raw === "company" ? "company" : "candidate";
}

export async function resolvePostAuthRoute(params: {
  preferredType?: AccountType | null;
}): Promise<string> {
  const user = await fetchCurrentUser();
  if (!user?.id) return "/v2/auth";

  const profile = await fetchProfile(user.id);
  const accountType = resolveAccountType({
    profile,
    preferredType: params.preferredType,
    userMetadataType: (user.user_metadata?.account_type as string | undefined) ?? null,
  });

  if (accountType === "company") {
    const hasCompany = await isCompanyOnboardingComplete();
    return hasCompany ? "/v2/company/dashboard" : "/v2/onboarding?type=company";
  }

  const candidateComplete = isCandidateOnboardingComplete(profile);
  return candidateComplete ? "/v2/candidate/dashboard" : "/v2/onboarding?type=candidate";
}
