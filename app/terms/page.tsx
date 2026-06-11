import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using Abode Alerts.",
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

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href="/"
        className="text-sm text-stone-500 transition hover:underline dark:text-stone-400"
      >
        ← Back to Abode Alerts
      </Link>

      <h1 className="mt-6 text-2xl font-semibold text-stone-900 dark:text-stone-50">
        Terms of Service
      </h1>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Last updated: {UPDATED}</p>

      <div className="mt-8 space-y-7 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
        <p>
          By using Abode Alerts (&quot;the app&quot;), you agree to these terms. If you do not
          agree, please do not use the app.
        </p>

        <Section title="What Abode Alerts is">
          <p>
            Abode Alerts is a personal, non-commercial property-monitoring tool. It aggregates
            real-estate listing-alert emails you already receive and presents the listings in one
            place. It is provided as-is, as a personal project, with no guarantee of availability.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            You sign in with your own Google account and are responsible for keeping it secure. You
            may stop using the app and revoke its access at any time from your{" "}
            <a
              href="https://myaccount.google.com/permissions"
              className="underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google account permissions
            </a>
            .
          </p>
        </Section>

        <Section title="No warranty and accuracy of data">
          <p>
            Listing details are extracted from third-party emails and public sources and may be
            incomplete, out of date, or inaccurate. The app is provided &quot;as is&quot; without
            warranties of any kind. Always verify property details with the listing agent or
            official source before acting on them.
          </p>
        </Section>

        <Section title="Not professional advice">
          <p>
            Nothing in the app is real-estate, financial, legal, or investment advice. It is an
            informational tool only.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>
            Use the app only with accounts and data you are authorized to access, and do not use it
            to break any law or any third party&apos;s terms of service.
          </p>
        </Section>

        <Section title="Limitation of liability">
          <p>
            To the maximum extent permitted by law, the app and its author are not liable for any
            damages arising from your use of, or inability to use, the app.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            These terms may change over time. Continued use after a change means you accept the
            updated terms. The &quot;Last updated&quot; date above reflects the current version.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions? Email{" "}
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
