import { supabase } from "@/lib/supabaseClient";
import { resolvePostAuthRoute, type AccountType } from "@/lib/auth/profile-service";

const ACCOUNT_TYPE_STORAGE_KEY = "hrkey_v2_account_type";

export type AuthMode = "signup" | "login";

export function persistPreferredAccountType(type: AccountType) {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACCOUNT_TYPE_STORAGE_KEY, type);
}

export function getPreferredAccountType(): AccountType | null {
  if (typeof window === "undefined") return null;
  const value = localStorage.getItem(ACCOUNT_TYPE_STORAGE_KEY);
  return value === "company" || value === "candidate" ? value : null;
}

export async function signUpWithEmail(params: {
  fullName: string;
  email: string;
  password: string;
  accountType: AccountType;
}) {
  persistPreferredAccountType(params.accountType);

  return supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      emailRedirectTo: `${window.location.origin}/v2/auth`,
      data: {
        full_name: params.fullName,
        account_type: params.accountType,
      },
    },
  });
}

export async function signInWithEmail(params: { email: string; password: string; accountType: AccountType }) {
  persistPreferredAccountType(params.accountType);
  return supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });
}

export async function continueWithGoogle(accountType: AccountType) {
  persistPreferredAccountType(accountType);

  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/v2/auth`,
      queryParams: {
        account_type: accountType,
      },
    },
  });
}

export async function completeOAuthCallbackIfNeeded() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  const hasOAuthCode = url.searchParams.has("code");

  if (!hasOAuthCode) return;

  const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
  if (error) throw error;

  window.history.replaceState({}, document.title, "/v2/auth");
}

export async function resolveNextV2Route(preferredType?: AccountType | null) {
  return resolvePostAuthRoute({ preferredType: preferredType ?? getPreferredAccountType() });
}

export { type AccountType };
