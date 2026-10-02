"use client";

// NextAuth's session hook (useSession) only works inside a "client" part of
// the app, but our root layout.tsx is a Server Component (it exports metadata,
// which only works server-side). This small wrapper bridges the two: layout.tsx
// stays a Server Component, and everything inside <Providers> can use useSession.

import { SessionProvider } from "next-auth/react";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
