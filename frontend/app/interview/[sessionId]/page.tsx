"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import { getSession, submitAnswerStreaming, completeSession, Question } from "@/lib/api";

type LoadState = "loading" | "ready" | "error";
type AnswerState = "idle" | "submitting" | "streaming" | "done";

// Pulls the SCORE_CLARITY / SCORE_STRUCTURE / SCORE_CONTENT lines out of
// the raw AI text so we can display a clean version + show them as badges instead.
function parseFeedback(raw: string) {
  const scoreRegex = /SCORE_(CLARITY|STRUCTURE|CONTENT):\s*(\d+(\.\d+)?)/gi;
  const scores: Record<string, number> = {};
  let match;
  while ((match = scoreRegex.exec(raw)) !== null) {
    scores[match[1].toLowerCase()] = parseFloat(match[2]);
  }
  const cleanText = raw.replace(scoreRegex, "").trim();
  return { cleanText, scores };
}

export default function InterviewSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const { data: authSession, status } = useSession();

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [role, setRole] = useState("");

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answerText, setAnswerText] = useState("");
  const [answerState, setAnswerState] = useState<AnswerState>("idle");
  const [feedback, setFeedback] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [collectedScores, setCollectedScores] = useState<number[]>([]);
  const [isCompleting, setIsCompleting] = useState(false);

  // Load the session and its questions on mount — waits until we actually
  // know who's logged in, since getSession now requires a userId for the
  // backend's ownership check.
  useEffect(() => {
    if (status !== "authenticated" || !authSession?.user?.id) return;

    async function load() {
      try {
        const { session } = await getSession(sessionId, authSession!.user!.id);
        setQuestions(session.questions);
        setRole(session.role);

        // Resume logic: find the first question that doesn't have completed
        // AI feedback yet, and jump straight to it instead of restarting at Q1.
        const firstUnansweredIndex = session.questions.findIndex(
          (q) => !q.answer || !q.answer.aiFeedback
        );
        setCurrentIndex(
          firstUnansweredIndex === -1
            ? session.questions.length
            : firstUnansweredIndex
        );

        setLoadState("ready");
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : "Could not load this session."
        );
        setLoadState("error");
      }
    }
    load();
  }, [sessionId, status, authSession]);

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;

  async function handleSubmitAnswer() {
    if (!answerText.trim() || !currentQuestion || !authSession?.user?.id) return;

    setAnswerState("submitting");
    setFeedback("");
    setSubmitError("");

    try {
      setAnswerState("streaming");
      const fullText = await submitAnswerStreaming(
        currentQuestion.id,
        answerText,
        authSession.user.id,
        (chunk) => {
          setFeedback((prev) => prev + chunk);
        }
      );
      const { scores } = parseFeedback(fullText);
      const values = Object.values(scores);
      if (values.length > 0) {
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        setCollectedScores((prev) => [...prev, avg]);
      }
      setAnswerState("done");
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong."
      );
      setAnswerState("idle");
    }
  }

  async function handleNextQuestion() {
    if (isLastQuestion && authSession?.user?.id) {
      setIsCompleting(true);
      const overallAverage =
        collectedScores.length > 0
          ? collectedScores.reduce((a, b) => a + b, 0) / collectedScores.length
          : 0;
      await completeSession(sessionId, overallAverage, authSession.user.id);
    }
    setCurrentIndex((prev) => prev + 1);
    setAnswerText("");
    setFeedback("");
    setAnswerState("idle");
    setSubmitError("");
    setIsCompleting(false);
  }

  // --- Still checking login status ---
  if (status === "loading") {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="font-mono text-sm text-muted animate-pulse">
          Loading...
        </p>
      </main>
    );
  }

  // --- Not logged in — ask them to sign in ---
  if (status === "unauthenticated") {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
        <div>
          <span className="font-mono text-xs tracking-widest text-accent uppercase">
            Sign in required
          </span>
          <h1 className="mt-3 font-display text-3xl text-foreground">
            Sign in to view this session.
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

  // --- Loading state ---
  if (loadState === "loading") {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center">
        <p className="font-mono text-sm text-muted animate-pulse">
          Loading your session...
        </p>
      </main>
    );
  }

  // --- Error state ---
  if (loadState === "error") {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md text-center">
          <p className="text-[#e8613d]">{loadError}</p>
          <button
            onClick={() => router.push("/interview/new")}
            className="mt-4 text-sm text-muted hover:text-foreground underline"
          >
            Start a new session instead
          </button>
        </div>
      </main>
    );
  }

  // --- All questions completed ---
  if (currentIndex >= questions.length) {
    const overallAverage =
      collectedScores.length > 0
        ? collectedScores.reduce((a, b) => a + b, 0) / collectedScores.length
        : null;

    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
        <div>
          <span className="font-mono text-xs tracking-widest text-accent-teal uppercase">
            Session complete
          </span>
          <h1 className="mt-3 font-display text-4xl text-foreground">
            Nice work.
          </h1>
          <p className="mt-3 text-muted max-w-sm mx-auto">
            You answered all {questions.length} questions for {role}.
          </p>
          {overallAverage !== null && (
            <p className="mt-6 font-mono text-3xl text-accent">
              {overallAverage.toFixed(1)}
              <span className="text-muted text-lg">/10</span>
            </p>
          )}
          <button
            onClick={() => router.push("/interview/new")}
            className="mt-8 rounded-lg bg-accent text-background font-medium px-6 py-3 hover:brightness-110 transition-all"
          >
            Start another session
          </button>
        </div>
      </main>
    );
  }

  // --- Main interview flow ---
  return (
    <main className="min-h-screen bg-background px-6 py-12">
      <div className="max-w-2xl mx-auto">
        {/* Progress */}
        <div className="flex items-center justify-between mb-8">
          <span className="font-mono text-xs text-muted">
            {role} · question {currentIndex + 1} of {questions.length}
          </span>
          <div className="flex gap-1.5">
            {questions.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  i <= currentIndex ? "bg-accent" : "bg-border-soft"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Question */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentQuestion.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <span className="font-mono text-xs text-accent uppercase">
              {currentQuestion.category}
            </span>
            <h2 className="mt-2 text-2xl text-foreground leading-snug">
              {currentQuestion.questionText}
            </h2>
          </motion.div>
        </AnimatePresence>

        {/* Answer input */}
        <div className="mt-8">
          <textarea
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            disabled={answerState === "streaming" || answerState === "submitting"}
            placeholder="Type your answer here..."
            rows={6}
            className="w-full rounded-lg bg-surface border border-border-soft px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:border-accent transition-colors resize-none disabled:opacity-60"
          />

          {submitError && (
            <p className="mt-2 text-sm text-[#e8613d]">{submitError}</p>
          )}

          {answerState === "idle" && (
            <button
              onClick={handleSubmitAnswer}
              disabled={!answerText.trim()}
              className="mt-4 rounded-lg bg-accent text-background font-medium px-6 py-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Submit answer
            </button>
          )}
        </div>

        {/* Streaming feedback */}
        <AnimatePresence>
          {(answerState === "streaming" || answerState === "done") && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 rounded-lg border border-border-soft bg-surface p-5"
            >
              <span className="font-mono text-xs text-accent-teal uppercase">
                AI feedback
              </span>
              <p className="mt-2 text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {parseFeedback(feedback).cleanText}
                {answerState === "streaming" && (
                  <span className="inline-block w-[7px] h-[13px] bg-accent-teal ml-0.5 translate-y-[1px] animate-pulse" />
                )}
              </p>

              {answerState === "done" && (
                <>
                  <div className="mt-4 flex gap-4 font-mono text-xs">
                    {Object.entries(parseFeedback(feedback).scores).map(
                      ([label, value]) => (
                        <span key={label} className="text-muted">
                          {label} <span className="text-accent-teal">{value}/10</span>
                        </span>
                      )
                    )}
                  </div>
                  <button
                    onClick={handleNextQuestion}
                    disabled={isCompleting}
                    className="mt-5 rounded-lg bg-accent text-background font-medium px-6 py-2.5 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    {isCompleting
                      ? "Finishing up..."
                      : isLastQuestion
                      ? "Finish session"
                      : "Next question"}
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}