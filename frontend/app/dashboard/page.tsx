"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession, signIn } from "next-auth/react";
import { getUserSessions, Session } from "@/lib/api";
import SessionHistoryCard from "@/components/SessionHistoryCard";

type LoadState = "loading" | "ready" | "error";

// Placeholder card shown while the real session list is loading.
// Shaped to roughly match SessionHistoryCard so there's no layout "jump"
// once the real data replaces it.
function SessionCardSkeleton() {
  return (
    <div className="rounded-lg border border-border-soft bg-surface px-5 py-4 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-4 w-40 rounded bg-border-soft" />
          <div className="h-3 w-24 rounded bg-border-soft" />
        </div>
        <div className="h-6 w-12 rounded bg-border-soft" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: authSession, status } = useSession();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (status !== "authenticated" || !authSession?.user?.id) return;

    async function load() {
      try {
        const { sessions } = await getUserSessions(authSession!.user!.id);
        setSessions(sessions);
        setLoadState("ready");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not load your sessions."
        );
        setLoadState("error");
      }
    }
    load();
  }, [status, authSession]);

  // Called by a SessionHistoryCard once it has successfully deleted itself
  // on the backend — removes that session from local state so the card
  // disappears from the list without needing to re-fetch everything.
  function handleSessionDeleted(sessionId: string) {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
  }

  // Still checking login status
  if (status === "loading") {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="font-mono text-sm text-muted animate-pulse">
          Loading...
        </p>
      </main>
    );
  }

  // Not logged in — ask them to sign in
  if (status === "unauthenticated") {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
        <div>
          <span className="font-mono text-xs tracking-widest text-accent uppercase">
            Sign in required
          </span>
          <h1 className="mt-3 font-display text-3xl text-foreground">
            Sign in to see your history.
          </h1>
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
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-10">
          <div>
            <span className="font-mono text-xs tracking-widest text-accent uppercase">
              Your history
            </span>
            <h1 className="mt-2 font-display text-3xl text-foreground">
              Past sessions
            </h1>
          </div>
          <Link
            href="/interview/new"
            className="rounded-lg bg-accent text-background font-medium px-5 py-2.5 hover:brightness-110 active:scale-[0.98] transition-all text-sm"
          >
            New session
          </Link>
        </div>

        {loadState === "loading" && (
          <div className="space-y-3">
            <SessionCardSkeleton />
            <SessionCardSkeleton />
            <SessionCardSkeleton />
          </div>
        )}

        {loadState === "error" && (
          <p className="text-sm text-[#e8613d]">{error}</p>
        )}

        {loadState === "ready" && sessions.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted">
              You haven't started a mock interview yet.
            </p>
            <Link
              href="/interview/new"
              className="mt-4 inline-block text-accent hover:underline text-sm"
            >
              Start your first one →
            </Link>
          </div>
        )}

        {loadState === "ready" && sessions.length > 0 && (
          <div className="space-y-3">
            {sessions.map((session, index) => (
              <SessionHistoryCard
                key={session.id}
                session={session}
                index={index}
                onDeleted={handleSessionDeleted}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}