import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Readability.",
};

const CONTACT = "readablebibleapp@gmail.com";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effectiveDate="June 21, 2026">
      <p>
        These terms govern your use of the Readability app. By using the app, you agree to
        them. If you do not agree, please do not use the app.
      </p>

      <LegalSection heading="The service">
        <p>
          Readability is a free Bible reading and comprehension tool that offers Scripture text,
          comprehension quizzes, cross-references, and study tools. We may change, add, or
          remove features over time.
        </p>
      </LegalSection>

      <LegalSection heading="Your account">
        <p>
          You can read without an account. If you create one, you are responsible for keeping
          your login credentials secure and for activity under your account. Provide accurate
          information when you sign up.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>use the app for any unlawful purpose or to harm others;</li>
          <li>
            attempt to disrupt, overload, scrape in bulk, reverse-engineer, or gain
            unauthorized access to the app or its systems; or
          </li>
          <li>resell or redistribute the app’s original content (comprehension quizzes) as your own.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Content and intellectual property">
        <p>
          Bible translations available in the app — the Berean Standard Bible (BSB) and King
          James Version (KJV) for reading, plus older public-domain translations (ASV, Geneva,
          Young’s Literal, Darby) offered for verse comparison — are in the public domain or
          freely usable under their respective terms. The app’s original materials, including
          comprehension questions and design, are owned by Readability and provided for your
          personal study use.
        </p>
        <p>
          Study notes are intended as accessible, educational aids for first-time readers. They
          are not a statement of official doctrine and may simplify contested or scholarly points.
        </p>
      </LegalSection>

      <LegalSection heading="Disclaimer">
        <p>
          The app is provided “as is” and “as available,” without warranties of any kind,
          whether express or implied. We do not warrant that the app will be uninterrupted,
          error-free, or that content is free of inaccuracies.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the fullest extent permitted by law, Readability will not be liable for any
          indirect, incidental, or consequential damages arising from your use of the app.
        </p>
      </LegalSection>

      <LegalSection heading="Termination">
        <p>
          You may stop using the app at any time and request deletion of your account. We may
          suspend or terminate access if these terms are violated.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to these terms">
        <p>
          We may update these terms from time to time. When we do, we will revise the effective
          date above. Continued use of the app after changes means you accept the updated terms.
        </p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>
          Questions about these terms? Email{" "}
          <a className="text-amber-600 underline hover:text-amber-700 dark:text-amber-400" href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>
          .
        </p>
      </LegalSection>
    </LegalPage>
  );
}
