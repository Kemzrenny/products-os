import { defineConfig } from "prisma/config";

// Migrations run against the direct (unpooled) Neon connection when there is one.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
});
