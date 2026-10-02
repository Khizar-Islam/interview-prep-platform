"use client";

import { useSession, signIn, signOut } from "next-auth/react";

export default function AuthButton() {
  const { data: session, status } = useSession();

  // Still checking if someone's logged in — show nothing to avoid a flash
  if (status === "loading") {
    return <div className="h-9 w-24" />;
  }

  if (session) {
    return (
      <div className="flex items-center gap-3">
        {session.user?.image && (
          <img
            src={session.user.image}
            alt={session.user.name || "Profile"}
            referrerPolicy="no-referrer"
            className="h-7 w-7 rounded-full ring-1 ring-border-soft"
          />
        )}
        <span className="text-sm text-foreground/90 hidden sm:inline">
          {session.user?.name}
        </span>
        <button
          onClick={() => signOut()}
          className="text-sm text-muted hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => signIn("google")}
      className="text-sm text-muted hover:text-accent transition-colors"
    >
      Sign in with Google
    </button>
  );
}
