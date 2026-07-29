import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Readability handles your account, reading progress, highlights, and notification data.",
};

const CONTACT = "readablebibleapp@gmail.com";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" effectiveDate="June 21, 2026">
      <p>
        Readability is a Bible reading and comprehension app. This policy explains what
        information we collect, how we use it, and the choices you have.
        You can use Readability to read the Bible without an account; some features
        described below apply only if you choose to create one.
      </p>

      <LegalSection heading="Information we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Account information.</strong> If you sign up, we store your email
            address through our authentication provider (Supabase). Signing in works by
            a one-time code sent to your email — there is no password to store.
          </li>
          <li>
            <strong>Reading and study data.</strong> When signed in, we save your reading
            progress, quiz results, highlights, and notes so they sync across your devices.
          </li>
          <li>
            <strong>Notification data.</strong> Daily reading reminders are available in the
            Readability mobile app. They are scheduled locally on your device — we do not
            collect or store any notification data, and you can turn reminders off at any time.
          </li>
          <li>
            <strong>Guest data stays on your device.</strong> If you are not signed in, your
            progress and preferences are kept in your browser’s local storage and are not sent
            to our servers.
          </li>
        </ul>
        <p>
          We do not run third-party advertising, we do not sell your personal information, and
          we do not currently use analytics or tracking cookies. The only cookies we set are
          the session cookies needed to keep you signed in.
        </p>
      </LegalSection>

      <LegalSection heading="How we use your information">
        <p>We use the information above only to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>provide the app and sync your progress across devices; and</li>
          <li>maintain the security and reliability of the service.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Service providers">
        <p>
          We rely on a small number of providers to operate the app, who process data on our
          behalf: <strong>Supabase</strong> (authentication and database hosting) and{" "}
          <strong>Vercel</strong> (application hosting and delivery). These providers may store
          data in the regions where their infrastructure operates.
        </p>
      </LegalSection>

      <LegalSection heading="Data retention and deletion">
        <p>
          We keep your account data for as long as your account exists. You can request that we
          delete your account and associated data at any time by emailing{" "}
          <a className="text-amber-600 underline hover:text-amber-700 dark:text-amber-400" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          . Guest data can be cleared at any time by clearing your browser storage.
        </p>
      </LegalSection>

      <LegalSection heading="Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct, export, or
          delete the personal information we hold about you. To exercise any of these rights,
          contact us at{" "}
          <a className="text-amber-600 underline hover:text-amber-700 dark:text-amber-400" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Children">
        <p>
          Readability is not directed to children under 13, and we do not knowingly collect
          personal information from them. If you believe a child has provided us information,
          please contact us and we will delete it.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>
          We may update this policy from time to time. When we do, we will revise the effective
          date above. Significant changes will be reflected here.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about this policy? Email{" "}
          <a className="text-amber-600 underline hover:text-amber-700 dark:text-amber-400" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
