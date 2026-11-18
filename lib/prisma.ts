import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// Postgres on Neon, through Prisma's Postgres adapter. On Vercel, DATABASE_URL is Neon's
// pooled connection; migrations use the unpooled one (see prisma.config.ts).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
