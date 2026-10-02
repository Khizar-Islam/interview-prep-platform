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
 * Automatically retries once if the database was asleep (Neon's free tier
 * suspends after inactivity, and the very first request after that can fail
 * before the database finishes waking up).
 */
export async function createSession(
  userId: string,
  role: string,
  experienceLevel: string,
  onRetry?: () => void
): Promise<CreateSessionResponse> {
  async function attempt(): Promise<CreateSessionResponse> {
    const res = await fetch(`${API_BASE_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, role, experienceLevel }),
    });

    if (!res.ok) {
      const errorBody = await res.json().catch(() => null);
      throw new Error(errorBody?.message || "Failed to create session.");
    }

    return res.json();
  }

  try {
    return await attempt();
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const looksLikeColdStart =
      message.includes("Can't reach database") || message.includes("connect");

    if (looksLikeColdStart) {
      onRetry?.(); // let the UI show "waking up the database..."
      await new Promise((resolve) => setTimeout(resolve, 2500));
      return attempt(); // one retry, then let any error bubble up normally
    }

    throw err;
  }
}

/**
 * Fetches a single session including all its questions and any saved answers.
 */
export async function getSession(sessionId: string): Promise<{ session: Session & { questions: (Question & { answer: { answerText: string; aiFeedback: string | null } | null })[] } }> {
  const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`);

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to load session.");
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
    throw new Error(errorBody?.message || "Failed to load sessions.");
  }

  return res.json();
}

/**
 * Marks a session as completed and saves the final overall score.
 */
export async function completeSession(
  sessionId: string,
  overallScore: number
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/complete`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ overallScore }),
  });

  if (!res.ok) {
    // Not critical if this fails silently — the user's answers are already saved.
    console.error("Failed to mark session complete.");
  }
}

/**
 * Submits an answer and streams the AI feedback back chunk by chunk.
 * onChunk fires every time a new piece of text arrives (for the typewriter effect).
 * Returns the full feedback text once streaming is complete.
 */
export async function submitAnswerStreaming(
  questionId: string,
  answerText: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/api/answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, answerText }),
  });

  if (!res.ok || !res.body) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(errorBody?.message || "Failed to submit answer.");
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

      try {
        const parsed = JSON.parse(line);
        if (parsed.chunk) {
          fullText += parsed.chunk;
          onChunk(parsed.chunk);
        }
        if (parsed.error) {
          throw new Error(parsed.error);
        }
      } catch {
        // ignore lines that aren't valid JSON (shouldn't normally happen)
      }
    }
  }

  return fullText;
}
