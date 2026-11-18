# Products OS

The strategy-to-outcome operating system for product teams. A CPO sets the strategy, the team runs every idea through an AI evaluation against it, approved ideas become initiatives on the roadmap, AI agents draft the legwork for people to approve, and the Command Centre shows leadership where everything stands.

It's a website and an installable app (PWA) in one Next.js project.

## The six modules

| Module | Where | What's in it |
| --- | --- | --- |
| 01 Organisation setup | `/onboarding`, `/app/settings`, `/app/products` | Organisations, workspaces, products, KPIs, invites, four roles |
| 02 Strategy management | `/app/strategy` | Company vision, product vision, pillars, objectives, product OKRs and key results, initiative links, strategy versions |
| 03 Ideas & prioritisation | `/app/ideas`, `/app/decisions` | Submit idea, customer problem, evidence, effort, AI evaluation, recommendation, approve/reject with reasons, decision history |
| 04 Product planning | `/app/roadmap`, `/app/initiatives/*`, `/app/tasks` | Initiatives, Now/Next/Later and timeline views, milestones, owners, basic tasks, status with required reasons |
| 05 AI workforce | `/app/copilot`, `/app/agents` | Product Copilot, Strategy, Prioritisation and PRD agents, source references, drafts with human approval |
| 06 Command Centre | `/app` | Portfolio, objective progress, initiative status, pending decisions, at-risk initiatives, AI briefing (shareable at `/b/<token>`) |

### Roles

| Role | Can |
| --- | --- |
| Admin | Everything: strategy, approving ideas onto the roadmap, approving strategy proposals and briefings, team and settings |
| Editor | Evaluate and decide ideas (except approving onto the roadmap), plan the roadmap, run agents, approve PRDs and backlog rankings |
| Contributor | Submit ideas, add evidence and effort, update milestones, tasks and initiative status |
| Viewer | Read everything, submit ideas, use Copilot |

### Rules the AI can't get round

- Every agent output is a **draft**. Nothing changes until a person with the right role approves it, and the audit log records who did.
- An idea with weak evidence is capped at "Explore further", never "Build now".
- Every evaluation, decision and agent run records the **strategy version** it was made under.
- Agents only cite objects that exist in the workspace; anything else is dropped.

## Stack

The same stack as The Doer Life and the GCCC Publishing portal:

- **Next.js 16** (App Router, server actions), React 19, Tailwind 4, TypeScript
- **Postgres on Neon** through **Prisma 7** with the Postgres adapter
- **JWT session cookie** auth (bcrypt passwords), checked against the database on every request
- **Gemini** (`@google/genai`) for all AI, with a fallback model and rate-limit handling
- **Vercel Cron** for the Monday briefing (`vercel.json`)
- **PWA**: `app/manifest.ts`, `public/sw.js` (offline page, cached static files), install button in the app

The look follows the Rootscards style: warm off-white page, Instrument Serif headlines with an italic second line, Plus Jakarta Sans for text, black pill buttons, soft white cards, and cobalt (`#2447d6`) as the one accent.

## Deploying to Vercel

1. Import `Kemzrenny/products-os` in Vercel.
2. Add a Neon database from **Storage**. This sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`.
3. Add environment variables: `JWT_SECRET`, `GEMINI_API_KEY`, `CRON_SECRET` (see `.env.example`).
4. Deploy. The build runs `prisma migrate deploy` on production deploys, so the tables are created automatically.
5. Open the site, press **Start free**, and set up your organisation.

## Running locally

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL and JWT_SECRET
npx prisma migrate deploy
npm run dev
```

Set `AI_FAKE=1` to click through every AI feature with canned answers and no Gemini key.

`tests/e2e.py` (Playwright) walks the whole product: sign-up, strategy, products, invites, ideas, evaluation, decisions, roadmap, milestones, tasks, all four agents with approvals, Copilot, the shared briefing, and a Viewer on a phone, including checks that no page is wider than the screen. Run it against `AI_FAKE=1 npm start` on port 3100 with a fresh database.
