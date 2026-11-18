"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCtx } from "@/lib/context";
import { attempt, str, need, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { atLeast } from "@/lib/roles";
import { runStrategyAgent, runPrioritisationAgent, runPrdAgent, runBriefing, askCopilot, newShareToken, type StrategyProposal, type BacklogRanking } from "@/lib/agents";
import type { Result } from "@/lib/result";
import { recordReading } from "@/lib/checkins";
import { teamMatcher } from "@/lib/import/apply";
import type { MeetingProposals } from "@/lib/meetings";
import type { DraftKind, Role } from "@/lib/generated/prisma/enums";

// Who may approve each kind of draft.
const APPROVER: Record<DraftKind, Role> = { STRATEGY_PROPOSAL: "ADMIN", BACKLOG_RANKING: "EDITOR", PRD: "EDITOR", BRIEFING: "ADMIN", MEETING_ACTIONS: "EDITOR" };

function refresh(draftId?: string) {
  revalidatePath("/app/agents");
  revalidatePath("/app");
  if (draftId) revalidatePath(`/app/agents/drafts/${draftId}`);
}

async function runAndOpen(fn: () => Promise<{ id: string }>): Promise<Result> {
  let id = "";
  const res = await attempt(async () => {
    id = (await fn()).id;
  });
  if (res?.error) return res;
  refresh();
  redirect(`/app/agents/drafts/${id}`);
}

export async function startStrategyAgent(): Promise<Result> {
  return runAndOpen(async () => runStrategyAgent(await requireCtx("EDITOR")));
}

export async function startPrioritisationAgent(): Promise<Result> {
  return runAndOpen(async () => runPrioritisationAgent(await requireCtx("EDITOR")));
}

export async function startPrdAgent(initiativeId: string): Promise<Result> {
  return runAndOpen(async () => runPrdAgent(await requireCtx("EDITOR"), initiativeId));
}

export async function startBriefing(): Promise<Result> {
  return runAndOpen(async () => runBriefing(await requireCtx("EDITOR")));
}

// Approving applies the draft to the real objects; nothing changed before this.
export async function approveDraft(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const draft = await prisma.draft.findFirstOrThrow({ where: { id: str(fd, "id"), workspaceId: ctx.workspace.id } });
    if (draft.status !== "PENDING") throw new UserError("This draft has already been reviewed.");
    if (!atLeast(ctx.role, APPROVER[draft.kind])) throw new UserError(`Only ${APPROVER[draft.kind].toLowerCase()}s can approve this kind of draft.`);
    let summary = "";

    if (draft.kind === "STRATEGY_PROPOSAL") {
      const c = draft.content as unknown as StrategyProposal;
      const picked = new Set(fd.getAll("proposal").map(String));
      const realign = new Set(fd.getAll("realign").map(String));
      const proposals = c.proposals.filter((_, i) => picked.has(String(i)));
      const realignments = c.realignments.filter((_, i) => realign.has(String(i)));
      if (!proposals.length && !realignments.length) throw new UserError("Tick at least one proposal to apply, or reject the draft.");
      const objectiveIds = new Set((await prisma.objective.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true } })).map((o) => o.id));
      await prisma.$transaction(async (tx) => {
        for (const p of proposals) {
          const objs = p.objectiveIds.filter((id) => objectiveIds.has(id));
          await tx.initiative.create({
            data: {
              workspaceId: ctx.workspace.id,
              title: p.title,
              description: `${p.description}\n\nWhy: ${p.rationale}`,
              horizon: p.horizon,
              objectives: objs.length ? { create: objs.map((objectiveId) => ({ objectiveId })) } : undefined,
            },
          });
        }
        for (const r of realignments) {
          const initiative = await tx.initiative.findFirst({ where: { id: r.initiativeId, workspaceId: ctx.workspace.id } });
          if (!initiative) continue;
          for (const objectiveId of r.objectiveIds.filter((id) => objectiveIds.has(id))) {
            await tx.initiativeObjective.upsert({
              where: { initiativeId_objectiveId: { initiativeId: initiative.id, objectiveId } },
              create: { initiativeId: initiative.id, objectiveId },
              update: {},
            });
          }
        }
      });
      summary = `Applied ${proposals.length} new initiative${proposals.length === 1 ? "" : "s"} and ${realignments.length} realignment${realignments.length === 1 ? "" : "s"} from the Strategy Agent`;
      revalidatePath("/app/roadmap");
      revalidatePath("/app/strategy");
    } else if (draft.kind === "BACKLOG_RANKING") {
      const c = draft.content as unknown as BacklogRanking;
      await prisma.$transaction([
        prisma.idea.updateMany({ where: { workspaceId: ctx.workspace.id }, data: { rank: null } }),
        ...c.ranking.map((r, i) => prisma.idea.updateMany({ where: { id: r.ideaId, workspaceId: ctx.workspace.id }, data: { rank: i + 1 } })),
      ]);
      summary = `Applied the Prioritisation Agent's backlog ranking (${c.ranking.length} ideas)`;
      revalidatePath("/app/ideas");
    } else if (draft.kind === "PRD") {
      const markdown = need(str(fd, "markdown"), "The PRD is empty.");
      const initiative = await prisma.initiative.findFirstOrThrow({ where: { id: draft.targetId ?? "", workspaceId: ctx.workspace.id } });
      await prisma.initiative.update({ where: { id: initiative.id }, data: { prd: markdown } });
      summary = `Approved the PRD for "${initiative.title}"`;
      revalidatePath(`/app/initiatives/${initiative.id}`);
    } else if (draft.kind === "BRIEFING") {
      const markdown = need(str(fd, "markdown"), "The briefing is empty.");
      const c = draft.content as { periodStart?: string; periodEnd?: string };
      await prisma.briefing.create({
        data: {
          workspaceId: ctx.workspace.id,
          title: str(fd, "title") || draft.title,
          body: markdown,
          shareToken: newShareToken(),
          periodStart: c.periodStart ? new Date(c.periodStart) : new Date(Date.now() - 7 * 86_400_000),
          periodEnd: c.periodEnd ? new Date(c.periodEnd) : new Date(),
        },
      });
      summary = `Approved the leadership briefing "${draft.title}"`;
      revalidatePath("/app/briefings");
    } else if (draft.kind === "MEETING_ACTIONS") {
      const c = draft.content as unknown as MeetingProposals;
      const meeting = await prisma.meeting.findFirstOrThrow({ where: { id: c.meetingId, workspaceId: ctx.workspace.id } });
      const pick = <T,>(name: string, list: T[]) => {
        const chosen = new Set(fd.getAll(name).map(String));
        return list.filter((_, i) => chosen.has(String(i)));
      };
      const match = await teamMatcher(ctx.org.id);
      const tasks = pick("task", c.tasks).map((t, i) => {
        const edited = str(fd, `taskTitle-${c.tasks.indexOf(t)}`) || t.title;
        const ownerText = str(fd, `taskOwner-${c.tasks.indexOf(t)}`) || t.owner || "";
        const owner = ownerText ? match(ownerText.split(/[/,&]/)[0].trim()) : null;
        void i;
        return { ...t, title: edited, ownerId: owner?.id ?? null, owner: ownerText || null };
      });
      const close = pick("close", c.closeTasks);
      const statuses = pick("status", c.initiativeUpdates);
      const checkins = pick("checkin", c.checkins);
      const decisions = pick("decision", c.decisions);
      const blockers = pick("blocker", c.blockers);
      const resolve = pick("resolve", c.resolveBlockers);
      const ideas = pick("idea", c.ideas);
      const ws = ctx.workspace.id;
      await prisma.$transaction(async (tx) => {
        for (const t of tasks) {
          const initiative = t.initiativeId ? await tx.initiative.findFirst({ where: { id: t.initiativeId, workspaceId: ws }, select: { id: true } }) : null;
          await tx.task.create({ data: { title: t.title.slice(0, 300), meetingId: meeting.id, initiativeId: initiative?.id ?? null, ownerId: t.ownerId, ownerName: t.ownerId ? null : t.owner, dueDate: t.due ? new Date(`${t.due}T12:00:00Z`) : null } });
        }
        for (const t of close) {
          await tx.task.updateMany({ where: { id: t.taskId, OR: [{ initiative: { workspaceId: ws } }, { meeting: { workspaceId: ws } }] }, data: { status: "DONE" } });
        }
        for (const u of statuses) {
          await tx.initiative.updateMany({ where: { id: u.initiativeId, workspaceId: ws }, data: { status: u.status } });
        }
        for (const k of checkins) {
          const kr = await tx.keyResult.findFirst({ where: { id: k.keyResultId, objective: { workspaceId: ws } }, select: { id: true } });
          if (kr) await recordReading(tx, { keyResultId: kr.id }, { value: k.value, date: meeting.date, note: `${meeting.title}: ${k.note}`.slice(0, 500), userId: ctx.user.id });
        }
        if (decisions.length || blockers.length) {
          await tx.meetingItem.createMany({
            data: [
              ...decisions.map((d) => ({ workspaceId: ws, meetingId: meeting.id, kind: d.kind, text: d.text, status: d.kind === "DECISION" ? ("RESOLVED" as const) : ("OPEN" as const) })),
              ...blockers.map((b) => ({ workspaceId: ws, meetingId: meeting.id, kind: "BLOCKER" as const, text: b.text, owner: b.owner, initiativeId: b.initiativeId })),
            ],
          });
        }
        for (const r of resolve) {
          await tx.meetingItem.updateMany({ where: { id: r.itemId, workspaceId: ws, status: "OPEN" }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedNote: `${meeting.title}: ${r.note}`.slice(0, 500) } });
        }
        for (const idea of ideas) {
          await tx.idea.create({ data: { workspaceId: ws, title: idea.title.slice(0, 200), description: idea.problem, problemWhat: idea.problem, source: "Meeting", requester: meeting.title, submittedById: ctx.user.id } });
        }
      });
      const parts = [
        tasks.length && `${tasks.length} task${tasks.length === 1 ? "" : "s"} added`,
        close.length && `${close.length} closed`,
        statuses.length && `${statuses.length} status change${statuses.length === 1 ? "" : "s"}`,
        checkins.length && `${checkins.length} check-in${checkins.length === 1 ? "" : "s"}`,
        decisions.length + blockers.length && `${decisions.length + blockers.length} logged`,
        resolve.length && `${resolve.length} blocker${resolve.length === 1 ? "" : "s"} resolved`,
        ideas.length && `${ideas.length} idea${ideas.length === 1 ? "" : "s"}`,
      ].filter(Boolean);
      summary = `Applied updates from "${meeting.title}": ${parts.join(", ") || "nothing selected"}`;
      for (const p of ["/app/meetings", "/app/tasks", "/app/roadmap", "/app/strategy", "/app/ideas"]) revalidatePath(p, "layout");
    }

    await prisma.draft.update({ where: { id: draft.id }, data: { status: "APPROVED", reviewedById: ctx.user.id, reviewedAt: new Date(), reviewNote: str(fd, "note") || null } });
    await audit(ctx, "draft.approved", "draft", draft.id, summary);
    refresh(draft.id);
    return "Approved and applied.";
  });
}

export async function rejectDraft(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const draft = await prisma.draft.findFirstOrThrow({ where: { id: str(fd, "id"), workspaceId: ctx.workspace.id } });
    if (draft.status !== "PENDING") throw new UserError("This draft has already been reviewed.");
    const note = need(str(fd, "note"), "Say why, so the next run can do better.");
    await prisma.draft.update({ where: { id: draft.id }, data: { status: "REJECTED", reviewedById: ctx.user.id, reviewedAt: new Date(), reviewNote: note } });
    await audit(ctx, "draft.rejected", "draft", draft.id, `Rejected the agent draft "${draft.title}": ${note}`);
    refresh(draft.id);
    return "Rejected.";
  });
}

// ---------- Copilot ----------

export async function sendToCopilot(_: Result, fd: FormData): Promise<Result> {
  let conversationId = str(fd, "conversationId");
  const res = await attempt(async () => {
    const ctx = await requireCtx("VIEWER");
    const question = need(str(fd, "question"), "Ask a question.").slice(0, 2000);
    let history: { role: string; content: string }[] = [];
    if (conversationId) {
      const c = await prisma.conversation.findFirstOrThrow({ where: { id: conversationId, workspaceId: ctx.workspace.id, userId: ctx.user.id }, include: { messages: { orderBy: { createdAt: "asc" } } } });
      history = c.messages;
    } else {
      conversationId = (await prisma.conversation.create({ data: { workspaceId: ctx.workspace.id, userId: ctx.user.id, title: question.slice(0, 80) } })).id;
    }
    await prisma.chatMessage.create({ data: { conversationId, role: "user", content: question } });
    try {
      const answer = await askCopilot(ctx, history, question);
      await prisma.chatMessage.create({
        data: { conversationId, role: "assistant", content: answer.answer, sources: { list: answer.sources, suggestedAgent: answer.suggestedAgent } },
      });
    } catch (err) {
      await prisma.chatMessage.create({ data: { conversationId, role: "assistant", content: `I couldn't answer that: ${err instanceof Error ? err.message : "the request failed"}.` } });
    }
    await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  });
  if (res?.error) return res;
  revalidatePath("/app/copilot");
  redirect(`/app/copilot?c=${conversationId}`);
}

export async function deleteConversation(id: string): Promise<Result> {
  const res = await attempt(async () => {
    const ctx = await requireCtx("VIEWER");
    await prisma.conversation.deleteMany({ where: { id, userId: ctx.user.id, workspaceId: ctx.workspace.id } });
  });
  if (res?.error) return res;
  redirect("/app/copilot");
}
