"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// This mimics the real product flow: a question is asked, an answer is given,
// then AI feedback streams in with a score. It loops so the hero never goes static.
const DEMO_QUESTION =
  "Explain the difference between let and const in JavaScript.";
const DEMO_ANSWER =
  "const prevents reassignment of the variable binding, while let allows it. Neither affects mutability of objects.";
const DEMO_FEEDBACK =
  "Clear and accurate. You correctly distinguished binding immutability from object mutability.";

type Phase = "question" | "answer" | "feedback" | "score" | "pause";

function useTypewriter(text: string, active: boolean, speed = 22) {
  const [output, setOutput] = useState("");

  useEffect(() => {
    if (!active) {
      setOutput("");
      return;
    }
    let i = 0;
    setOutput("");
    const interval = setInterval(() => {
      i += 1;
      setOutput(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, speed);
    return () => clearInterval(interval);
  }, [text, active, speed]);

  return output;
}

export default function HeroTerminal() {
  const [phase, setPhase] = useState<Phase>("question");
  const [score, setScore] = useState(0);

  const questionText = useTypewriter(DEMO_QUESTION, phase === "question");
  const answerText = useTypewriter(DEMO_ANSWER, phase === "answer");
  const feedbackText = useTypewriter(DEMO_FEEDBACK, phase === "feedback");

  // Drives the phase loop: question -> answer -> feedback -> score -> pause -> restart
  useEffect(() => {
    let timeout: NodeJS.Timeout;

    if (phase === "question") {
      timeout = setTimeout(() => setPhase("answer"), DEMO_QUESTION.length * 22 + 500);
    } else if (phase === "answer") {
      timeout = setTimeout(() => setPhase("feedback"), DEMO_ANSWER.length * 22 + 500);
    } else if (phase === "feedback") {
      timeout = setTimeout(() => setPhase("score"), DEMO_FEEDBACK.length * 22 + 400);
    } else if (phase === "score") {
      timeout = setTimeout(() => setPhase("pause"), 1800);
    } else if (phase === "pause") {
      timeout = setTimeout(() => {
        setScore(0);
        setPhase("question");
      }, 1600);
    }

    return () => clearTimeout(timeout);
  }, [phase]);

  // Animate the score counting up once we hit the "score" phase
  useEffect(() => {
    if (phase !== "score") return;
    const target = 9;
    let current = 0;
    const interval = setInterval(() => {
      current += 1;
      setScore(current);
      if (current >= target) clearInterval(interval);
    }, 90);
    return () => clearInterval(interval);
  }, [phase]);

  return (
    <div className="w-full max-w-md rounded-xl border border-border-soft bg-surface shadow-2xl shadow-black/40 overflow-hidden">
      {/* Window chrome */}
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-border-soft">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e8613d]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e8a33d]/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#4fa0a0]/70" />
        <span className="ml-3 font-mono text-xs text-muted">
          session — frontend-developer.mock
        </span>
      </div>

      <div className="p-5 font-mono text-[13px] leading-relaxed min-h-[220px]">
        {/* Question */}
        <div className="mb-4">
          <span className="text-accent">Q1 · behavioral</span>
          <p className="mt-1 text-foreground">
            {questionText}
            {phase === "question" && <BlinkCursor />}
          </p>
        </div>

        {/* Answer */}
        {(phase === "answer" ||
          phase === "feedback" ||
          phase === "score" ||
          phase === "pause") && (
          <div className="mb-4">
            <span className="text-muted">you</span>
            <p className="mt-1 text-foreground/90">
              {phase === "answer" ? (
                <>
                  {answerText}
                  <BlinkCursor />
                </>
              ) : (
                DEMO_ANSWER
              )}
            </p>
          </div>
        )}

        {/* Feedback */}
        <AnimatePresence>
          {(phase === "feedback" || phase === "score" || phase === "pause") && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-t border-border-soft pt-3"
            >
              <span className="text-accent-teal">ai feedback</span>
              <p className="mt-1 text-foreground/80">
                {phase === "feedback" ? (
                  <>
                    {feedbackText}
                    <BlinkCursor />
                  </>
                ) : (
                  DEMO_FEEDBACK
                )}
              </p>

              {(phase === "score" || phase === "pause") && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-3 flex gap-4 text-xs"
                >
                  <span className="text-muted">
                    clarity <span className="text-accent-teal">{score}/10</span>
                  </span>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function BlinkCursor() {
  return (
    <span className="inline-block w-[7px] h-[13px] bg-accent ml-0.5 translate-y-[1px] animate-pulse" />
  );
}
