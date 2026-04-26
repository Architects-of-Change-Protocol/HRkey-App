import { supabase } from "@/lib/supabaseClient";

export type RefereeDashboardMetrics = {
  referee_id: string;
  trust_score: number;
  trust_tier: string;
  earnings: number;
  references_completed: number;
  purchases_generated: number;
  repeat_buyers: number;
  growth_last_30d: number;
  badges: string[];
};

export type CompanyDashboardMetrics = {
  company_id: string;
  purchases_made: number;
  useful_references_pct: number;
  saved_referees: number;
  credits_balance: number;
};

export async function recalculateTrustScore(userId: string) {
  const { data, error } = await supabase.rpc("recalculate_trust_score", { p_user_id: userId });
  if (error) throw error;
  return data;
}

export async function getRefereeDashboardMetrics(userId: string): Promise<RefereeDashboardMetrics | null> {
  const { data, error } = await supabase
    .from("referee_dashboard_metrics_v1")
    .select("*")
    .eq("referee_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const { data: badgeData, error: badgeError } = await supabase
    .from("user_trust_badges")
    .select("badge_code, trust_badges(label)")
    .eq("user_id", userId)
    .is("revoked_at", null);

  if (badgeError) throw badgeError;

  const badges = (badgeData || []).map((row: any) => row.trust_badges?.label || row.badge_code);

  return {
    ...data,
    badges,
  } as RefereeDashboardMetrics;
}

export async function getCompanyDashboardMetrics(userId: string): Promise<CompanyDashboardMetrics | null> {
  const { data, error } = await supabase
    .from("company_dashboard_metrics_v1")
    .select("*")
    .eq("company_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data as CompanyDashboardMetrics | null;
}


export type TrustModerationQueueItem = {
  referee_id: string;
  current_trust_score: number;
  trust_tier: string;
  open_disputes: number;
  refunds: number;
  low_reviews: number;
  last_signal_at: string;
};

export async function getTrustModerationQueue(): Promise<TrustModerationQueueItem[]> {
  const { data, error } = await supabase
    .from("trust_moderation_queue_v1")
    .select("*")
    .order("open_disputes", { ascending: false })
    .order("refunds", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data || []) as TrustModerationQueueItem[];
}

export async function moderateTrust(
  refereeId: string,
  actionType: "override_score" | "award_badge" | "revoke_badge" | "open_dispute" | "dismiss_dispute",
  reason: string,
  payload: Record<string, unknown> = {},
) {
  const { data, error } = await supabase.rpc("admin_moderate_trust", {
    p_referee_id: refereeId,
    p_action_type: actionType,
    p_reason: reason,
    p_payload: payload,
  });

  if (error) throw error;
  return data;
}
