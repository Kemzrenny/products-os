<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## This project

- Products OS: see README.md for modules, roles and the AI approval rules.
- Prisma 7 with the Postgres adapter; the client is generated into `lib/generated/prisma` (git-ignored, built on install).
- Every server action returns a `Result` and goes through `attempt()` in `lib/action.ts`; check the role with `requireCtx(min)`.
- Agent output always lands as a `Draft`; only `approveDraft` changes real data.
