// A single shared Prisma connection for the frontend, same pattern as the
// backend's config/db.js. NextAuth's adapter uses this to read/write users,
// accounts, and login sessions.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
