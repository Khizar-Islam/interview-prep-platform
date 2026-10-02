// NextAuth's default types don't include the real database user id on the
// session object. This file extends those types so TypeScript knows about
// session.user.id without complaining, matching what we added in auth.ts.

import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
