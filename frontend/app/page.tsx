import Link from "next/link";
import HeroTerminal from "@/components/HeroTerminal";
import HowItWorks from "@/components/HowItWorks";
import AuthButton from "@/components/AuthButton";

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      {/* Nav */}
      <header className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between border-b border-border-soft/60">
        <span className="font-display text-lg text-foreground tracking-tight">
          Interview Prep
        </span>
        <div className="flex items-center gap-7">
          <Link
            href="/dashboard"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
          <AuthButton />
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-16 pb-24 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <span className="font-mono text-xs tracking-widest text-accent uppercase">
            Mock interview simulator
          </span>
          <h1 className="mt-4 font-display text-5xl md:text-6xl leading-[1.05] text-foreground">
            Practice like it&apos;s the real thing.
          </h1>
          <p className="mt-6 text-lg text-muted max-w-md leading-relaxed">
            Pick a role, answer real interview questions, and get instant AI
            feedback on clarity, structure, and content — before it counts.
          </p>
          <div className="mt-9 flex items-center gap-5">
            <Link
              href="/interview/new"
              className="rounded-lg bg-accent text-background font-medium px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all"
            >
              Start a mock interview
            </Link>
            <a
              href="#how-it-works"
              className="text-sm text-muted hover:text-foreground transition-colors"
            >
              See how it works
            </a>
          </div>
        </div>

        <div className="flex justify-center md:justify-end">
          <HeroTerminal />
        </div>
      </section>

      {/* How it works */}
      <HowItWorks />

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-6 py-10 border-t border-border-soft">
        <p className="font-mono text-xs text-muted">
          Built by Khizar — a portfolio project.
        </p>
      </footer>
    </main>
  );
}
