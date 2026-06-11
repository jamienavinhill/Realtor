import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Abode Alerts accesses, uses, and protects your data.",
};

const UPDATED = "June 10, 2026";
const CONTACT = "jamienavinhill@gmail.com";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/"
        className="text-sm text-stone-500 transition hover:underline dark:text-stone-400"
      >
        ← Back to Abode Alerts
      </Link>

      <h1 className="mt-6 text-2xl font-semibold text-stone-900 dark:text-stone-50">
        Privacy Policy
      </h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Last updated: {UPDATED}</p>

      <div className="mt-8 space-y-7 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
        <p>
          Abode Alerts is a personal property-monitoring tool. It reads real-estate listing-alert
          emails you already receive, extracts the listing details, and shows them in one dashboard.
          This policy explains what data it accesses and how that data is used.
        </p>

        <Section title="Information we access">
          <p>
            When you sign in with Google, we receive your basic Google profile (name, email address,
            and profile photo). With your explicit consent, Abode Alerts may also request:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              <strong>Gmail (read-only)</strong> — to find and read the listing-alert emails that
              match your chosen platforms (e.g. Zillow, Redfin, Realtor.com) and extract the
              property details from them.
            </li>
            <li>
              <strong>Google Sheets, Calendar, and Drive</strong> — only when you choose to export a
              listing, schedule a tour, or save a file. We only touch the specific items you act on.
            </li>
          </ul>
        </Section>

        <Section title="How we use your data">
          <p>
            Google user data is used solely to provide the features you asked for: extracting
            listings from your alert emails, displaying them in your dashboard, evaluating your
            saved search alerts, and performing the export/scheduling actions you trigger. We do not
            use your data for advertising, and we do not sell or rent it to anyone.
          </p>
        </Section>

        <Section title="Google API Services — Limited Use">
          <p>
            Abode Alerts&apos; use and transfer of information received from Google APIs adheres to
            the{" "}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements. We do not transfer or use Gmail data for
            serving ads, and humans do not read your email except where required for security or to
            comply with the law.
          </p>
        </Section>

        <Section title="Storage and security">
          <p>
            Listings and your preferences are stored in Google Firebase (Firestore). If you connect
            automatic email ingestion, your Google authorization token is encrypted at rest and used
            only to read your listing-alert emails on your behalf — it is never exposed to other
            users or to your browser.
          </p>
        </Section>

        <Section title="Data retention and deletion">
          <p>
            Your data stays only as long as you use the app. You can sign out at any time, and you
            can request deletion of your account data — including any stored Gmail authorization —
            by emailing us at{" "}
            <a href={`mailto:${CONTACT}`} className="underline">
              {CONTACT}
            </a>
            . We will remove it promptly.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            We may update this policy from time to time. Material changes will be reflected by the
            &quot;Last updated&quot; date above.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy? Email{" "}
            <a href={`mailto:${CONTACT}`} className="underline">
              {CONTACT}
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}
