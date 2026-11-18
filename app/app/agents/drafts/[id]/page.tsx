import Link from "next/link";
import { notFound } from "next/navigation";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { atLeast } from "@/lib/roles";
import { DRAFT_KIND, AGENT, HORIZON } from "@/lib/labels";
import { fmtDate, timeAgo } from "@/lib/format";
import { PageHeader, Section, Chip, Notice } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import Markdown from "@/components/Markdown";
import { approveDraft, rejectDraft } from "@/app/actions/agents";
import type { Source, StrategyProposal, BacklogRanking } from "@/lib/agents";
import type { Role } from "@/lib/generated/prisma/enums";

export const metadata = { title: "Review draft" };

const APPROVER: Record<string, Role> = { STRATEGY_PROPOSAL: "ADMIN", BACKLOG_RANKING: "EDITOR", PRD: "EDITOR", BRIEFING: "ADMIN" };

export default async function DraftPage({ params }: PageProps<"/app/agents/drafts/[id]">) {
  const ctx = await getCtx();
  const { id } = await params;
  const draft = await prisma.draft.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: { run: { include: { startedBy: { select: { name: true } } } }, reviewedBy: { select: { name: true } } },
  });
  if (!draft) notFound();
  const objectives = await prisma.objective.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, title: true } });
  const objTitle = (oid: string) => objectives.find((o) => o.id === oid)?.title ?? "Unknown objective";
  const sources = (draft.sources as unknown as Source[]) ?? [];
  const canApprove = draft.status === "PENDING" && atLeast(ctx.role, APPROVER[draft.kind]);
  const canReject = draft.status === "PENDING" && atLeast(ctx.role, "EDITOR");
  const stale = draft.run.strategyVersion < ctx.workspace.strategyVersion;

  return (
    <>
      <PageHeader crumbs={["AI workforce", "Drafts", DRAFT_KIND[draft.kind]]} title={draft.title} lead={`${AGENT[draft.run.agent].name} · started by ${draft.run.startedBy.name} ${timeAgo(draft.createdAt)} · strategy v${draft.run.strategyVersion}`}>
        <Chip tone={draft.status === "PENDING" ? "amber" : draft.status === "APPROVED" ? "green" : "red"}>{draft.status === "PENDING" ? "Awaiting approval" : draft.status === "APPROVED" ? "Approved" : "Rejected"}</Chip>
      </PageHeader>

      {draft.status !== "PENDING" && (
        <Notice tone={draft.status === "APPROVED" ? "green" : "red"}>
          {draft.status === "APPROVED" ? "Approved" : "Rejected"} by {draft.reviewedBy?.name ?? "someone"} on {fmtDate(draft.reviewedAt)}
          {draft.reviewNote ? `: ${draft.reviewNote}` : "."}
        </Notice>
      )}
      {draft.status === "PENDING" && stale && <Notice tone="amber">The strategy has changed since this draft was written. Consider running the agent again.</Notice>}
      {draft.status === "PENDING" && !canApprove && <Notice tone="grey">Only {APPROVER[draft.kind].toLowerCase()}s can approve this kind of draft.</Notice>}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          {draft.summary && <p className="display text-2xl">{draft.summary}</p>}

          {draft.kind === "STRATEGY_PROPOSAL" && <StrategyReview id={draft.id} c={draft.content as unknown as StrategyProposal} objTitle={objTitle} canApprove={canApprove} />}
          {draft.kind === "BACKLOG_RANKING" && <RankingReview id={draft.id} c={draft.content as unknown as BacklogRanking} canApprove={canApprove} />}
          {(draft.kind === "PRD" || draft.kind === "BRIEFING") && (
            <TextReview id={draft.id} kind={draft.kind} title={draft.title} markdown={(draft.content as { markdown: string }).markdown} canApprove={canApprove} />
          )}

          {canReject && (
            <Section title="Reject">
              <ActionForm action={rejectDraft} submit="Reject draft" submitClass="btn-danger" className="flex flex-col gap-3">
                <input type="hidden" name="id" value={draft.id} />
                <textarea name="note" className="field min-h-16" required placeholder="Why? For example, 'Proposals ignore the Q1 capacity limit'." aria-label="Reason for rejecting" />
              </ActionForm>
            </Section>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <Section title={`Sources (${sources.length})`}>
            {sources.length === 0 ? (
              <p className="text-sm text-muted">The agent cited no specific items.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {sources.map((s) => (
                  <li key={`${s.type}-${s.id}`} className="flex items-start gap-2">
                    <Chip dot={false}>{s.type}</Chip>
                    <Link href={s.href} className="min-w-0 flex-1 text-xs font-semibold hover:underline">{s.label}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="How approval works">
            <p className="text-xs leading-relaxed text-muted">
              Approving applies this draft to your real data, and the audit log records who approved it. Rejecting changes nothing; your reason is kept so the next run can be judged against it.
            </p>
          </Section>
        </aside>
      </div>
    </>
  );
}

function StrategyReview({ id, c, objTitle, canApprove }: { id: string; c: StrategyProposal; objTitle: (id: string) => string; canApprove: boolean }) {
  return (
    <ActionForm action={approveDraft} submit="Approve selected" pending="Applying…" className="flex flex-col gap-6" submitClass={canApprove ? "btn-primary" : "hidden"}>
      <input type="hidden" name="id" value={id} />
      <Section title={`Gaps found (${c.gaps.length})`}>
        {c.gaps.length === 0 ? (
          <p className="text-sm text-muted">No gaps.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {c.gaps.map((g, i) => (
              <li key={i} className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">{g.note}</li>
            ))}
          </ul>
        )}
      </Section>
      <Section title={`Proposed initiatives (${c.proposals.length})`}>
        {c.proposals.length === 0 && <p className="text-sm text-muted">No new initiatives proposed.</p>}
        <ul className="flex flex-col gap-3">
          {c.proposals.map((p, i) => (
            <li key={i}>
              <label className="flex cursor-pointer gap-3 rounded-2xl border border-line p-4 has-[:checked]:border-ink has-[:checked]:bg-field">
                {canApprove && <input type="checkbox" name="proposal" value={i} defaultChecked className="mt-1" />}
                <span className="flex flex-col gap-1">
                  <span className="text-sm font-extrabold">{p.title} <Chip dot={false}>{HORIZON[p.horizon]}</Chip></span>
                  <span className="text-sm text-ink-2">{p.description}</span>
                  <span className="text-xs text-muted"><b>Why:</b> {p.rationale}</span>
                  {p.objectiveIds.length > 0 && <span className="text-[11px] text-accent">→ {p.objectiveIds.map(objTitle).join(", ")}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </Section>
      {c.realignments.length > 0 && (
        <Section title={`Realignments (${c.realignments.length})`}>
          <ul className="flex flex-col gap-3">
            {c.realignments.map((r, i) => (
              <li key={i}>
                <label className="flex cursor-pointer gap-3 rounded-2xl border border-line p-4 has-[:checked]:border-ink has-[:checked]:bg-field">
                  {canApprove && <input type="checkbox" name="realign" value={i} defaultChecked className="mt-1" />}
                  <span className="flex flex-col gap-1 text-sm">
                    <Link href={`/app/initiatives/${r.initiativeId}`} className="font-bold hover:underline">Link this initiative</Link>
                    <span className="text-[11px] text-accent">→ {r.objectiveIds.map(objTitle).join(", ")}</span>
                    <span className="text-xs text-muted">{r.reason}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </ActionForm>
  );
}

function RankingReview({ id, c, canApprove }: { id: string; c: BacklogRanking; canApprove: boolean }) {
  return (
    <Section title={`Proposed order (${c.ranking.length})`}>
      <ol className="flex flex-col gap-2">
        {c.ranking.map((r, i) => (
          <li key={r.ideaId} className="flex gap-3 rounded-xl border border-line p-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <Link href={`/app/ideas/${r.ideaId}`} className="text-sm font-bold hover:underline">{r.title}</Link>
              <span className="block text-xs text-muted">{r.reason}</span>
            </span>
          </li>
        ))}
      </ol>
      {canApprove && (
        <ActionForm action={approveDraft} submit="Apply this order" pending="Applying…" className="mt-4 flex flex-col gap-2">
          <input type="hidden" name="id" value={id} />
        </ActionForm>
      )}
    </Section>
  );
}

function TextReview({ id, kind, title, markdown, canApprove }: { id: string; kind: "PRD" | "BRIEFING"; title: string; markdown: string; canApprove: boolean }) {
  return (
    <>
      <Section title="Preview">
        <Markdown text={markdown} />
      </Section>
      {canApprove && (
        <Section title="Edit and approve">
          <ActionForm action={approveDraft} submit={kind === "PRD" ? "Approve PRD" : "Approve briefing"} pending="Approving…" className="flex flex-col gap-3">
            <input type="hidden" name="id" value={id} />
            {kind === "BRIEFING" && <input name="title" className="field" defaultValue={title} aria-label="Briefing title" />}
            <textarea name="markdown" className="field min-h-96 font-mono text-xs leading-relaxed" defaultValue={markdown} aria-label="Content (markdown)" />
            <p className="hint">Edits here are what gets saved. {kind === "PRD" ? "The PRD is attached to the initiative." : "The briefing gets a share link you can send to leadership."}</p>
          </ActionForm>
        </Section>
      )}
    </>
  );
}
