// This file centralizes all calls to your backend (the Express server on port 5000).
// If you ever deploy and the backend URL changes, you only update it here.
//
// Sign-in: every backend call goes through apiFetch(), which attaches
// "Authorization: Bearer <token>". The token comes from our own Next.js route
// /api/api-token, which signs it for whoever is signed in. The backend works
// out the user from that token, so we never send a userId ourselves.

import { decodeJwt } from "jose";
import { signIn } from "next-auth/react";

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
 * Thrown when the user turns out to be signed out. By the time callers see
 * it, we've already started redirecting them to sign in, so pages should
 * just stay in their loading state instead of showing an error.
 */
export class SignedOutError extends Error {
  constructor() {
    super("You are signed out. Redirecting you to sign in...");
    this.name = "SignedOutError";
  }
}

export function isSignedOutError(err: unknown): err is SignedOutError {
  return err instanceof SignedOutError;
}

// --- Token cache -----------------------------------------------------------
// Kept in memory only (never localStorage). Reused until ~30s before it
// expires, so most calls don't need an extra round trip.

const TOKEN_REFRESH_MARGIN_MS = 30_000;

let cachedToken: { token: string; expiresAtMs: number } | null = null;
let tokenRequest: Promise<string> | null = null;
let redirectingToSignIn = false;

// Loop breaker: if we sent the user to sign in less than a minute ago and the
// token route still says "signed out", something is wrong (e.g. the session
// isn't reaching the server). Show an error instead of redirecting again.
const SIGN_IN_REDIRECT_KEY = "api-sign-in-redirect-at";
const SIGN_IN_LOOP_WINDOW_MS = 60_000;

function redirectedToSignInRecently(): boolean {
  try {
    const at = Number(sessionStorage.getItem(SIGN_IN_REDIRECT_KEY));
    return at > 0 && Date.now() - at < SIGN_IN_LOOP_WINDOW_MS;
  } catch {
    return false;
  }
}

function rememberSignInRedirect(at: number | null) {
  try {
    if (at === null) sessionStorage.removeItem(SIGN_IN_REDIRECT_KEY);
    else sessionStorage.setItem(SIGN_IN_REDIRECT_KEY, String(at));
  } catch {
    // Storage blocked (private mode etc.): the loop breaker just won't apply.
  }
}

function redirectToSignIn(): never {
  cachedToken = null;
  // Several calls failing at once only trigger one redirect.
  if (redirectingToSignIn) throw new SignedOutError();

  if (redirectedToSignInRecently()) {
    throw new Error(
      "We couldn't confirm your sign-in. Please sign out, sign in again, and reload the page."
    );
  }

  redirectingToSignIn = true;
  rememberSignInRedirect(Date.now());
  // Same thing the "Sign in with Google" buttons do. If it fails to start,
  // fall back to NextAuth's own sign-in page so the user isn't left on a
  // page that is stuck loading.
  signIn("google").catch(() => {
    redirectingToSignIn = false;
    window.location.assign("/api/auth/signin");
  });
  throw new SignedOutError();
}

async function fetchNewToken(): Promise<string> {
  const res = await fetch("/api/api-token", { cache: "no-store" });

  // Signed out: send them to sign in. No retry here, so no loop.
  if (res.status === 401) {
    redirectToSignIn();
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || typeof body?.token !== "string") {
    throw new Error(
      body?.message || "Couldn't verify your sign-in. Please refresh the page."
    );
  }

  // Signed in fine, so a later "signed out" should redirect again normally.
  rememberSignInRedirect(null);

  const { exp } = decodeJwt(body.token);
  cachedToken = {
    token: body.token,
    expiresAtMs: (exp ?? 0) * 1000,
  };
  return body.token;
}

async function getApiToken(forceRefresh = false): Promise<string> {
  if (redirectingToSignIn) throw new SignedOutError();

  if (
    !forceRefresh &&
    cachedToken &&
    Date.now() < cachedToken.expiresAtMs - TOKEN_REFRESH_MARGIN_MS
  ) {
    return cachedToken.token;
  }

  // If several calls need a token at the same moment, share one request.
  if (!tokenRequest) {
    tokenRequest = fetchNewToken().finally(() => {
      tokenRequest = null;
    });
  }
  return tokenRequest;
}

/**
 * fetch() for the backend, with the sign-in token attached.
 * If the backend says 401 (e.g. the token just expired), it gets a fresh
 * token and tries exactly once more. Returns the raw Response, so callers
 * (including the streaming one) handle the body as before.
 */
async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  async function send(token: string) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  }

  const res = await send(await getApiToken());
  if (res.status !== 401) return res;

  // One retry with a brand-new token. If that is still 401, the caller
  // shows the backend's { error, message } like any other error.
  cachedToken = null;
  return send(await getApiToken(true));
}

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
  role: string,
  experienceLevel: string,
  onWakingUp?: (elapsedSeconds: number) => void
): Promise<CreateSessionResponse> {
  async function attempt(): Promise<CreateSessionResponse> {
    const res = await apiFetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, experienceLevel }),
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

    if (looksLikeColdStart && !isSignedOutError(err)) {
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
 * The backend only returns it if it belongs to the signed-in user.
 */
export async function getSession(
  sessionId: string
): Promise<{ session: Session & { questions: (Question & { answer: { answerText: string; aiFeedback: string | null } | null })[] } }> {
  const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`);

  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new Error(
      errorBody?.message || "Couldn't load this session. Please try again."
    );
  }

  return res.json();
}

/**
 * Fetches every session belonging to the signed-in user, newest first.
 * Used by the dashboard to show session history.
 */
export async function getUserSessions(): Promise<{ sessions: Session[] }> {
  const res = await apiFetch("/api/sessions");

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
 */
export async function completeSession(
  sessionId: string,
  overallScore: number
): Promise<void> {
  try {
    const res = await apiFetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/complete`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overallScore }),
      }
    );

    if (!res.ok) {
      // Not critical if this fails silently — the user's answers are already saved.
      console.error("Failed to mark session complete.");
    }
  } catch {
    // Same as above (also covers being signed out: the redirect is already under way).
    console.error("Failed to mark session complete.");
  }
}

/**
 * Permanently deletes a session and all its questions/answers (cascades on
 * the backend via Prisma's onDelete: Cascade). Used by the delete button on
 * the dashboard. The backend only deletes it if it belongs to the signed-in user.
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });

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
 * The backend only accepts it if the question's session belongs to the
 * signed-in user.
 *
 * IMPORTANT: if the backend sends an { error: "..." } message mid-stream
 * (e.g. Gemini failed partway through), that error is thrown here so it
 * reaches the UI as a real, visible message — it must NOT be silently
 * swallowed inside the JSON-parsing try/catch below.
 */
export async function submitAnswerStreaming(
  questionId: string,
  answerText: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const res = await apiFetch("/api/answers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, answerText }),
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
