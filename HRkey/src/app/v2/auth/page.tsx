import CreateAccountForm from "@/components/v2/CreateAccountForm";
import V2Shell from "@/components/v2/V2Shell";

type SearchParams = {
  type?: string;
};

export default async function V2AuthPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const initialType = params.type === "company" ? "company" : "candidate";

  return (
    <V2Shell
      active="auth"
      userType={initialType}
      title="Secure sign up"
      subtitle="Create your HRKey account to launch your guided onboarding flow."
    >
      <div className="flex min-h-[70vh] items-center justify-center">
        <CreateAccountForm initialType={initialType} />
      </div>
    </V2Shell>
  );
}
