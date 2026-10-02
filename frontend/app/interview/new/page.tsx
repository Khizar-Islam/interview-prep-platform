"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { motion } from "framer-motion";
import { createSession } from "@/lib/api";

const EXPERIENCE_LEVELS = [
  { value: "junior", label: "Junior (0–2 yrs)" },
  { value: "mid", label: "Mid-level (2–5 yrs)" },
  { value: "senior", label: "Senior (5+ yrs)" },
];

const ROLE_SUGGESTIONS = [
  "Frontend Developer",
  "Backend Developer",
  "Full-Stack Developer",
  "Mobile Developer",
  "DevOps Engineer",
  "Data Engineer",
  "AI/ML Engineer",
];

export default function NewInterviewPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [role, setRole] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("junior");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wakingUpSeconds, setWakingUpSeconds] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!role.trim()) {
      setError("Please enter a role.");
      return;
    }
    if (!session?.user?.id) {
      setError("Please sign in first.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const { session: newSession } = await createSession(
        session.user.id,
        role.trim(),
        experienceLevel,
        (elapsedSeconds) => setWakingUpSeconds(elapsedSeconds)
      );
      router.push(`/interview/${newSession.id}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
      setIsSubmitting(false);
      setWakingUpSeconds(null);
    }
  }

  // Still checking login status — avoid flashing the wrong screen
  if (status === "loading") {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="font-mono text-sm text-muted animate-pulse">
          Loading...
        </p>
      </main>
    );
  }

  // Not logged in — ask them to sign in before starting a session
  if (status === "unauthenticated") {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
        <div>
          <span className="font-mono text-xs tracking-widest text-accent uppercase">
            Sign in required
          </span>
          <h1 className="mt-3 font-display text-3xl text-foreground">
            Let's get you signed in first.
          </h1>
          <p className="mt-3 text-muted max-w-sm mx-auto">
            Your sessions and history are saved to your account.
          </p>
          <button
            onClick={() => signIn("google")}
            className="mt-8 rounded-lg bg-accent text-background font-medium px-6 py-3 hover:brightness-110 transition-all"
          >
            Sign in with Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <span className="font-mono text-xs tracking-widest text-accent uppercase">
          New session
        </span>
        <h1 className="mt-3 font-display text-4xl text-foreground">
          What are you prepping for?
        </h1>
        <p className="mt-3 text-muted">
          We'll generate 5 questions tailored to the role and level you pick.
        </p>

        <form onSubmit={handleSubmit} className="mt-9 space-y-6">
          {/* Role input */}
          <div>
            <label
              htmlFor="role"
              className="block font-mono text-xs text-muted mb-2"
            >
              ROLE
            </label>
            <input
              id="role"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Frontend Developer"
              className="w-full rounded-lg bg-surface border border-border-soft px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:border-accent transition-colors"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {ROLE_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setRole(suggestion)}
                  className="text-xs font-mono text-muted hover:text-accent border border-border-soft rounded-full px-3 py-1 transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* Experience level */}
          <div>
            <label className="block font-mono text-xs text-muted mb-2">
              EXPERIENCE LEVEL
            </label>
            <div className="grid grid-cols-3 gap-2">
              {EXPERIENCE_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setExperienceLevel(level.value)}
                  className={`rounded-lg border px-3 py-3 text-sm transition-colors ${
                    experienceLevel === level.value
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border-soft text-muted hover:text-foreground"
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <p className="text-sm text-[#e8613d]" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-accent text-background font-medium px-6 py-3.5 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {wakingUpSeconds !== null
              ? `Waking up the server... (${wakingUpSeconds}s, can take up to a minute)`
              : isSubmitting
              ? "Generating your questions..."
              : "Start interview"}
          </button>
        </form>
      </motion.div>
    </main>
  );
}