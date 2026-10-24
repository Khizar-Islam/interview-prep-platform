import type { Metadata } from "next";
import Link from "next/link";

// Public page: no sign-in check here, and there is no middleware/proxy file,
// so it opens for signed-out visitors (Google's OAuth review needs that).
// Keep it in sync with what the app actually stores and sends.

export const metadata: Metadata = {
  title: "Privacy — Interview Prep",
  description:
    "What Interview Prep stores, who it is sent to, and how to remove it.",
};

const CONTACT_EMAIL = "khizarislamrathore@gmail.com";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-xl text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-muted leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function Email() {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="text-accent hover:underline"
    >
      {CONTACT_EMAIL}
    </a>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <Link
          href="/"
          className="font-mono text-xs text-muted hover:text-foreground transition-colors"
        >
          ← Back to home
        </Link>

        <span className="mt-10 block font-mono text-xs tracking-widest text-accent uppercase">
          Privacy
        </span>
        <h1 className="mt-3 font-display text-4xl text-foreground">
          What this app keeps, and where it goes.
        </h1>
        <p className="mt-4 text-muted leading-relaxed">
          Interview Prep is a portfolio project. This page lists what it
          stores about you, who it is sent to, and how to remove it.
        </p>
        <p className="mt-2 font-mono text-xs text-muted">
          Last updated 24 October 2026
        </p>

        <Section title="What it stores">
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Your Google name, email address and profile picture link, plus
              the sign-in tokens Google returns when you sign in (kept so the
              sign-in keeps working). It asks Google only for your basic
              profile, and never sees your Google password.
            </li>
            <li>
              A record of each browser you are signed in on, so you stay
              signed in.
            </li>
            <li>
              Your interview sessions: the role and experience level you pick,
              whether the session is finished, the overall score, and when you
              started and finished.
            </li>
            <li>The questions generated for each session.</li>
            <li>
              Your answers, the AI feedback on them, and the clarity,
              structure and content scores.
            </li>
          </ul>
        </Section>

        <Section title="Who it is sent to">
          <p>
            <span className="text-foreground">Google (Gemini API).</span> To
            write questions and feedback, the app sends Gemini the interview
            role and experience level, the question text and your answer
            text. Your name, email and Google data are never sent to Gemini.
          </p>
          <p>
            This app uses a free Gemini API key, and Google&apos;s free-tier
            terms allow Google to use what is sent to it. Don&apos;t type
            anything confidential into your answers.
          </p>
          <p>
            <span className="text-foreground">Hosting.</span> The website runs
            on Vercel, the API on Render and the database on Neon. Vercel,
            Render and Neon keep their normal request logs, which this app
            does not control.
          </p>
        </Section>

        <Section title="What it doesn't do">
          <p>
            Your data is not sold and is not shown to other users. There are
            no analytics or ad trackers.
          </p>
        </Section>

        <Section title="Removing your data">
          <p>
            You can delete any interview session from the dashboard, which
            also deletes its questions and answers.
          </p>
          <p>
            There is no delete-account button. To remove your account and
            everything else, email <Email /> from the address you signed in
            with.
          </p>
        </Section>

        <Section title="Cookies and browser storage">
          <p>
            Cookies are used only for signing in: one that keeps you signed
            in, and short-lived ones that protect the sign-in step. There are
            no tracking cookies.
          </p>
          <p>
            The app also keeps a single timestamp in your browser tab&apos;s
            session storage to stop sign-in redirect loops. It disappears when
            you close the tab.
          </p>
        </Section>

        <Section title="Questions">
          <p>
            Email <Email />.
          </p>
        </Section>
      </div>
    </main>
  );
}
