import Link from "next/link";
import { motion } from "framer-motion";
import { Session } from "@/lib/api";

export default function SessionHistoryCard({
  session,
  index,
}: {
  session: Session;
  index: number;
}) {
  const isCompleted = session.status === "completed";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.05 }}
    >
      <Link
        href={`/interview/${session.id}`}
        className="block rounded-lg border border-border-soft bg-surface px-5 py-4 hover:border-accent/60 transition-colors"
      >
        <div className="flex items-center justify-between">
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
    </motion.div>
  );
}
