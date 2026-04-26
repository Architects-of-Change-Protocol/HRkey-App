import Link from "next/link";

export default function ReferenceSuccessPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#f8fafc", display: "grid", placeItems: "center", padding: 20 }}>
      <section style={{ maxWidth: 560, width: "100%", background: "#fff", borderRadius: 18, padding: 24, textAlign: "center", color: "#0f172a" }}>
        <h1>Reference submitted</h1>
        <p>Thank you. Your feedback helps build a more transparent professional reputation.</p>
        <Link href="/" style={{ display: "inline-block", marginTop: 16, background: "#0d9488", color: "#fff", padding: "12px 16px", borderRadius: 12, textDecoration: "none", fontWeight: 700 }}>
          Learn about HRKey
        </Link>
      </section>
    </main>
  );
}
