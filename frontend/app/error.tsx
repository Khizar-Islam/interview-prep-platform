"use client";

// Next.js automatically renders this component whenever an unexpected error
// is thrown anywhere inside the app during rendering. It replaces the
// default plain error screen with something matching our dark theme.
//
// Note: this only catches errors thrown during React rendering — it does
// NOT catch errors from our own try/catch blocks in api.ts (those are
// handled separately, inline, where they happen).

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the real error to the browser console for debugging — Next.js
    // does not do this automatically inside a custom error boundary.
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6 text-center">
      <div>
        <span className="font-mono text-xs tracking-widest text-[#e8613d] uppercase">
          Something went wrong
        </span>
        <h1 className="mt-3 font-display text-3xl text-foreground">
          That wasn't supposed to happen.
        </h1>
        <p className="mt-3 text-muted max-w-sm mx-auto">
          An unexpected error occurred. You can try again, or head back to
          the homepage.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <button
            onClick={() => reset()}
            className="rounded-lg bg-accent text-background font-medium px-6 py-3 hover:brightness-110 transition-all"
          >
            Try again
          </button>
          
           <a href="/"
            className="text-sm text-muted hover:text-foreground transition-colors"
          >
            Go home
          </a>
        </div>
      </div>
    </main>
  );
}

