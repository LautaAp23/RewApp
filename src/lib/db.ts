import { PrismaClient } from "@prisma/client";

// Reuses one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const db = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

export { db };
