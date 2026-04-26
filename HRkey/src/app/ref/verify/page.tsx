import { redirect } from "next/navigation";

export default async function VerifyReferenceLegacyRoute({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (token) {
    redirect(`/references/respond/${encodeURIComponent(token)}`);
  }

  redirect("/");
}
