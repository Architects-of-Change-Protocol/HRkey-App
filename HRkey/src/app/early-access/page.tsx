import Link from "next/link";
import Navbar from "@/components/Navbar";
import Section from "@/components/Section";
import EarlyAccessForm from "./EarlyAccessForm";

export const metadata = {
  title: "Early Access · HRKey",
  description: "HRKey is evolving. Private Beta coming soon.",
};

export default function EarlyAccessPage() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <Section className="pb-16">
        <div className="text-center py-16 sm:py-24 max-w-2xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
            HRKey is evolving.
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            We are currently preparing the next generation of the platform.
          </p>
          <p className="mt-2 text-lg font-semibold text-slate-800">
            Private Beta coming soon.
          </p>
          <p className="mt-6 text-slate-600">
            If you would like early access, leave us your email and we&apos;ll
            contact you when invitations become available.
          </p>

          <EarlyAccessForm />

          <p className="mt-10 text-sm text-slate-500">
            <Link href="/" className="hover:underline">
              Back to home
            </Link>
          </p>
        </div>
      </Section>
    </main>
  );
}
