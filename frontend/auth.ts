// This is the central auth configuration. It tells NextAuth:
// 1. How to store users/logins (the Prisma adapter, using your Neon database)
// 2. Which login method to offer (Google)
// 3. How sessions should work (stored in the database, not just a cookie)

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: {
    // "database" means login sessions are tracked in your actual database
    // (the Session model / auth_sessions table), not just an encrypted cookie.
    strategy: "database",
  },
  callbacks: {
    // Makes the real database user id available on the session object,
    // so pages can do session.user.id instead of looking it up separately.
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});