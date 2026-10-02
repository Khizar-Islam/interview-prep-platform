// This file connects NextAuth's internal login logic to a real URL Next.js
// can serve. You won't need to edit this file again — all the actual
// configuration lives in auth.ts at the project root.

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
