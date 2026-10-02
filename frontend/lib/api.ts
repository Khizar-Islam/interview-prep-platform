// This file centralizes all calls to your backend (the Express server on port 5000).
// If you ever deploy and the backend URL changes, you only update it here.

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export type Question = {
  id: string;
  questionText: string;
  questionOrder: number;
  category: string;
};

export type Session = {
  id: string;
  userId: string;
  role: string;
  experienceLevel: string;
  status: string;
  overallScore: number | null;
};

type CreateSessionResponse = {
  session: Session;
  questions: Question[];
};

/**
 * Creates a new interview session and triggers AI question generation.
 *
 * Two separate "cold start" scenarios can happen on the free tiers:
 * 1. Neon's Postgres database auto-suspends after ~5 min idle — the request
 *    fails almost immediately with a connection error, and a short 2.5s
 *    retry is enough to recover from this.
 * 2. Render's backend service itself auto-suspends after ~15 min idle — the
 *    request doesn't fail, it just takes up to ~50 seconds to respond while
 *    Render boots the server back up. This isn't an error to retry, it's
 *    just a slow (but successful) request — so instead we show a live
 *    "waking up" counter via onWakingUp while we wait for it.
 *
 * onWakingUp fires every 3 seconds, starting at 3, with the number of
 * seconds elapsed so far — e.g. 3, 6, 9, 12... If the request finishes
 * before the first 3-second mark (the normal, warm case), onWakingUp never
 * fires at all, so most users never see this UI.
 */
export async function createSession(
  userId: string,
  role: string,
  experienceLevel: string,
  onWakingUp?: (elapsedSeconds: number) => void
): Promise<CreateSessionResponse> {
  async function attempt(): Promise<CreateSessionResponse> {
    const res = await fetch(`${API_BASE_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role, experienceLevel }),
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new Error(
        errorBody?.message ||
          "Couldn't start your session. Please try again in a moment."
      );
    }

    return res.json();
  }

  let elapsed = 0;
  const tickInterval = setInterval(() => {
    elapsed += 3;
    onWakingUp?.(elapsed);
  }, 3000);

  try {
    return await attempt();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const looksLikeColdStart =
      message.includes("Can't reach database") || message.includes("connect");

    if (looksLikeColdStart) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return await attempt(); // one retry, then let any error bubble up normally
    }

    throw err;
  } finally {
    clearInterval(tickInterval);
  }
}

/**
 * Fetches a single session including all its questions and any saved answers.
 * userId is required now so the backend can confirm this session actually
 * belongs to the requesting user before returning it.
 */
export async function getSession(
  sessionId: string,
  userId: string
): Promise<{ session: Session & { questions: (Question & { answer: { answerText: string; aiFeedback: string | null } | null })[] } }> {
  const res = await fetch(
    `${API_BASE_URL}/api/sessions/${sessionId}?userId=${encodeURIComponent(userId)}`
  );

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(
      errorBody?.message || "Couldn't load this session. Please try again."
    );
  }

  return res.json();
}

export { API_BASE_URL };

/**
 * Fetches every session belonging to a user, newest first.
 * Used by the dashboard to show session history.
 */
export async function getUserSessions(userId: string): Promise<{ sessions: Session[] }> {
  const res = await fetch(`${API_BASE_URL}/api/sessions/user/${userId}`);

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(
      errorBody?.message ||
        "Couldn't load your sessions. Please try again."
    );
  }

  return res.json();
}

/**
 * Marks a session as completed and saves the final overall score.
 * userId is required now so the backend can confirm ownership before
 * marking it complete.
 */
export async function completeSession(
  sessionId: string,
  overallScore: number,
  userId: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/complete`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overallScore, userId }),
  });

  if (!res.ok) {
    // Not critical if this fails silently — the user's answers are already saved.
    console.error("Failed to mark session complete.");
  }
}

/**
 * Permanently deletes a session and all its questions/answers (cascades on
 * the backend via Prisma's onDelete: Cascade). Used by the delete button on
 * the dashboard. userId is required now so the backend can confirm
 * ownership before deleting.
 */
export async function deleteSession(sessionId: string, userId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE_URL}/api/sessions/${sessionId}?userId=${encodeURIComponent(userId)}`,
    { method: "DELETE" }
  );

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(
      errorBody?.message || "Couldn't delete this session. Please try again."
    );
  }
}

/**
 * Submits an answer and streams the AI feedback back chunk by chunk.
 * onChunk fires every time a new piece of text arrives (for the typewriter effect).
 * Returns the full feedback text once streaming is complete.
 *
 * userId is required now so the backend can confirm this question's parent
 * session actually belongs to the requesting user.
 *
 * IMPORTANT: if the backend sends an { error: "..." } message mid-stream
 * (e.g. Gemini failed partway through), that error is thrown here so it
 * reaches the UI as a real, visible message — it must NOT be silently
 * swallowed inside the JSON-parsing try/catch below.
 */
export async function submitAnswerStreaming(
  questionId: string,
  answerText: string,
  userId: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, answerText, userId }),
  });

  if (!res.ok || !res.body) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(
      errorBody?.message || "Couldn't submit your answer. Please try again."
    );
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Server-Sent Events separate messages with a blank line ("\n\n")
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || ""; // keep the last, possibly incomplete part

    for (const part of parts) {
      const line = part.replace(/^data: /, "").trim();
      if (!line) continue;

      // Only JSON-parsing failures are swallowed here (shouldn't normally
      // happen). A successfully-parsed { error: "..." } message is NOT a
      // parsing failure — it's a real backend error and must be thrown
      // outside this try block so it isn't silently caught below.
      let parsed: { chunk?: string; done?: boolean; error?: string } | null = null;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (parsed?.error) {
        throw new Error(
          "The AI had trouble generating feedback for this answer. Please try submitting again."
        );
      }
      if (parsed?.chunk) {
        fullText += parsed.chunk;
        onChunk(parsed.chunk);
      }
    }
  }

  return fullText;
}