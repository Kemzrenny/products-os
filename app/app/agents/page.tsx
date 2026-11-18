import Link from "next/link";
import { Bot, Target, ListOrdered, FileText, Newspaper, MessageSquareText, ArrowUpRight } from "lucide-react";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { atLeast } from "@/lib/roles";
import { AGENT, DRAFT_KIND } from "@/lib/labels";
import { timeAgo } from "@/lib/format";
import { aiConfigured } from "@/lib/gemini";
import { PageHeader, Section, Chip, Notice, Empty } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { startStrategyAgent, startPrioritisationAgent, startBriefing } from "@/app/actions/agents";

export const metadata = { title: "Agents & drafts" };

export default async function AgentsPage() {
  const ctx = await getCtx();
  const editor = atLeast(ctx.role, "EDITOR");
  const [pending, reviewed, runs, initiatives] = await Promise.all([
    prisma.draft.findMany({ where: { workspaceId: ctx.workspace.id, status: "PENDING" }, orderBy: { createdAt: "desc" }, include: { run: { select: { startedBy: { select: { name: true } } } } } }),
    prisma.draft.findMany({ where: { workspaceId: ctx.workspace.id, status: { not: "PENDING" } }, orderBy: { reviewedAt: "desc" }, take: 15, include: { reviewedBy: { select: { name: true } } } }),
    prisma.agentRun.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, take: 12, include: { startedBy: { select: { name: true } } } }),
    prisma.initiative.findMany({ where: { workspaceId: ctx.workspace.id, prd: null, status: { not: "DONE" } }, select: { id: true, title: true }, take: 5 }),
  ]);

  return (
    <>
      <PageHeader crumbs={["AI workforce", "Agents"]} title="Your AI product office" lead="Specialised agents that do the legwork. Everything they produce lands here as a draft. Nothing changes until a person approves it." />

      {!aiConfigured() && <Notice tone="amber">AI is off. Add a Gemini API key in Vercel to run the agents.</Notice>}

      <section aria-label="Agents" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AgentCard icon={<Target size={16} aria-hidden />} name={AGENT.STRATEGY.name} blurb={AGENT.STRATEGY.blurb} approver="Admin approves">
          {editor && <ActionButton action={startStrategyAgent} className="btn-primary btn-sm" pending="Reviewing strategy…">Run</ActionButton>}
        </AgentCard>
        <AgentCard icon={<ListOrdered size={16} aria-hidden />} name={AGENT.PRIORITISATION.name} blurb="Evaluates new ideas, then ranks the open backlog against your strategy." approver="Editor approves">
          {editor && <ActionButton action={startPrioritisationAgent} className="btn-primary btn-sm" pending="Ranking…">Run</ActionButton>}
        </AgentCard>
        <AgentCard icon={<FileText size={16} aria-hidden />} name={AGENT.PRD.name} blurb={AGENT.PRD.blurb} approver="Editor approves">
          {initiatives.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted">Needs a PRD:</span>
              {initiatives.slice(0, 3).map((i) => (
                <Link key={i.id} href={`/app/initiatives/${i.id}`} className="truncate text-xs font-semibold text-accent hover:underline">{i.title}</Link>
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-muted">Start it from an initiative page.</span>
          )}
        </AgentCard>
        <AgentCard icon={<Newspaper size={16} aria-hidden />} name={AGENT.BRIEFING.name} blurb="Drafts the weekly leadership briefing. Runs itself every Monday morning." approver="Admin approves">
          {editor && <ActionButton action={startBriefing} className="btn-primary btn-sm" pending="Writing…">Run now</ActionButton>}
        </AgentCard>
      </section>

      <Link href="/app/copilot" className="card flex items-center gap-4 p-4 transition-shadow hover:shadow-[var(--shadow-float)]">
        <span className="flex size-10 items-center justify-center rounded-xl bg-ink text-white"><MessageSquareText size={18} aria-hidden /></span>
        <span className="flex-1">
          <span className="block text-sm font-extrabold">{AGENT.COPILOT.name}</span>
          <span className="block text-xs text-muted">{AGENT.COPILOT.blurb} Every answer links to its sources.</span>
        </span>
        <ArrowUpRight size={16} aria-hidden />
      </Link>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Section title={`Awaiting approval (${pending.length})`}>
          {pending.length === 0 ? (
            <Empty title="No drafts waiting">Run an agent and its output appears here for review.</Empty>
          ) : (
            <ul className="flex flex-col gap-2">
              {pending.map((d) => (
                <li key={d.id}>
                  <Link href={`/app/agents/drafts/${d.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3.5 hover:bg-field">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-accent"><Bot size={16} aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{d.title}</span>
                      <span className="block truncate text-xs text-muted">{d.summary}</span>
                      <span className="block text-[11px] text-subtle">{DRAFT_KIND[d.kind]} · started by {d.run.startedBy.name} · {timeAgo(d.createdAt)}</span>
                    </span>
                    <span className="btn-quiet btn-sm">Review</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <aside className="flex flex-col gap-6">
          <Section title="Reviewed">
            {reviewed.length === 0 ? (
              <p className="text-sm text-muted">Nothing reviewed yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {reviewed.map((d) => (
                  <li key={d.id} className="flex items-start gap-2">
                    <Chip tone={d.status === "APPROVED" ? "green" : "red"}>{d.status === "APPROVED" ? "Approved" : "Rejected"}</Chip>
                    <Link href={`/app/agents/drafts/${d.id}`} className="min-w-0 flex-1 text-xs">
                      <span className="block truncate font-semibold hover:underline">{d.title}</span>
                      <span className="text-subtle">{d.reviewedBy?.name ?? "Someone"} · {d.reviewedAt ? timeAgo(d.reviewedAt) : ""}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Recent runs">
            <ul className="flex flex-col gap-2">
              {runs.length === 0 && <li className="text-sm text-muted">No runs yet.</li>}
              {runs.map((r) => (
                <li key={r.id} className="text-xs">
                  <span className="font-semibold">{AGENT[r.agent].name}</span> <span className="text-muted">· {r.startedBy.name} · {timeAgo(r.createdAt)}</span>{" "}
                  {r.status === "FAILED" ? <span className="text-bad">· failed: {r.error}</span> : r.status === "RUNNING" ? <span className="text-warn">· running</span> : null}
                </li>
              ))}
            </ul>
          </Section>
        </aside>
      </div>
    </>
  );
}

function AgentCard({ icon, name, blurb, approver, children }: { icon: React.ReactNode; name: string; blurb: string; approver: string; children?: React.ReactNode }) {
  return (
    <div className="card flex flex-col gap-2.5 p-4">
      <span className="flex size-9 items-center justify-center rounded-xl bg-accent-soft text-accent">{icon}</span>
      <p className="text-sm font-extrabold">{name}</p>
      <p className="flex-1 text-xs text-muted">{blurb}</p>
      <p className="text-[11px] font-semibold text-subtle">{approver}</p>
      <div>{children}</div>
    </div>
  );
}
