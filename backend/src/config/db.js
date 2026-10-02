// This file creates ONE shared connection to your database (Prisma Client)
// and every other file in the backend will import this same connection
// instead of each creating its own. This prevents "too many connections" errors.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
