"use client";

// Note: this file now uses useState (for the delete-confirmation UI), so it
// needs the "use client" directive at the top — it wasn't there before
// because the original version had no interactivity of its own.

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Session, deleteSession } from "@/lib/api";

type ConfirmState = "idle" | "confirming" | "deleting" | "error";

export default function SessionHistoryCard({
  session,
  index,
  onDeleted,
}: {
  session: Session;
  index: number;
  onDeleted: (sessionId: string) => void;
}) {
  const isCompleted = session.status === "completed";
  const [confirmState, setConfirmState] = useState<ConfirmState>("idle");
  const [deleteError, setDeleteError] = useState("");

  async function handleConfirmDelete() {
    setConfirmState("deleting");
    setDeleteError("");

    try {
      await deleteSession(session.id);
      onDeleted(session.id); // tells the dashboard to remove this card from the list
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Something went wrong."
      );
      setConfirmState("error");
    }
  }

  // --- Confirmation / deleting / error state replaces the card's normal content ---
  if (confirmState !== "idle") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: index * 0.05 }}
        className="rounded-lg border border-[#e8613d]/40 bg-surface px-5 py-4"
      >
        {confirmState === "deleting" ? (
          <p className="font-mono text-sm text-muted animate-pulse">
            Deleting...
          </p>
        ) : (
          <div>
            <p className="text-foreground/90 text-sm">
              Delete this session? This can&apos;t be undone.
            </p>

            {confirmState === "error" && (
              <p className="mt-2 text-sm text-[#e8613d]">{deleteError}</p>
            )}

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={handleConfirmDelete}
                className="text-sm rounded-lg bg-[#e8613d] text-background font-medium px-4 py-2 hover:brightness-110 active:scale-[0.98] transition-all"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmState("idle")}
                className="text-sm text-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  // --- Normal card content ---
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
      className="group relative rounded-lg border border-border-soft bg-surface px-5 py-4 hover:border-accent/60 transition-colors"
    >
      <Link href={`/interview/${session.id}`} className="block">
        <div className="flex items-center justify-between pr-8">
          <div>
            <p className="text-foreground font-medium">{session.role}</p>
            <p className="mt-1 font-mono text-xs text-muted capitalize">
              {session.experienceLevel} ·{" "}
              <span
                className={isCompleted ? "text-accent-teal" : "text-accent"}
              >
                {session.status.replace("_", " ")}
              </span>
            </p>
          </div>

          {isCompleted && session.overallScore !== null && (
            <span className="font-mono text-xl text-accent">
              {session.overallScore.toFixed(1)}
              <span className="text-muted text-sm">/10</span>
            </span>
          )}
        </div>
      </Link>

      {/* Delete button — only visible on hover, sits in the top-right corner */}
      <button
        onClick={(e) => {
          e.preventDefault(); // don't trigger the Link navigation underneath
          e.stopPropagation();
          setConfirmState("confirming");
        }}
        aria-label="Delete session"
        className="absolute top-4 right-4 text-muted opacity-0 group-hover:opacity-100 hover:text-[#e8613d] transition-all text-lg leading-none"
      >
        ×
      </button>
    </motion.div>
  );
}