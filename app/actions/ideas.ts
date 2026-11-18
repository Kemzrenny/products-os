"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCtx } from "@/lib/context";
import { attempt, str, optStr, optDate, need, ids, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { atLeast } from "@/lib/roles";
import { evaluateIdea } from "@/lib/agents";
import type { Result } from "@/lib/result";
import type { DecisionOutcome, Effort, EvidenceKind } from "@/lib/generated/prisma/enums";

const EFFORTS: Effort[] = ["XS", "S", "M", "L", "XL"];
const KINDS: EvidenceKind[] = ["QUOTE", "METRIC", "LINK", "NOTE"];
const OUTCOMES: DecisionOutcome[] = ["APPROVED", "EXPLORING", "DEFERRED", "REJECTED"];

function refresh(id?: string) {
  revalidatePath("/app/ideas");
  if (id) revalidatePath(`/app/ideas/${id}`);
  revalidatePath("/app");
}

async function ideaFor(ctx: Awaited<ReturnType<typeof requireCtx>>, id: string) {
  return prisma.idea.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
}

// Anyone in the organisation can submit an idea, Viewers included.
export async function submitIdea(_: Result, fd: FormData): Promise<Result> {
  let id = "";
  const res = await attempt(async () => {
    const ctx = await requireCtx("VIEWER");
    const productId = optStr(fd, "productId");
    if (productId) await prisma.product.findFirstOrThrow({ where: { id: productId, workspaceId: ctx.workspace.id } });
    const effort = str(fd, "effort") as Effort;
    const idea = await prisma.idea.create({
      data: {
        workspaceId: ctx.workspace.id,
        productId,
        title: need(str(fd, "title"), "Give the idea a title."),
        description: optStr(fd, "description"),
        source: optStr(fd, "source"),
        requester: optStr(fd, "requester"),
        problemWho: optStr(fd, "problemWho"),
        problemWhat: optStr(fd, "problemWhat"),
        problemWhy: optStr(fd, "problemWhy"),
        effort: EFFORTS.includes(effort) && atLeast(ctx.role, "CONTRIBUTOR") ? effort : null,
        effortById: EFFORTS.includes(effort) && atLeast(ctx.role, "CONTRIBUTOR") ? ctx.user.id : null,
        submittedById: ctx.user.id,
      },
    });
    const evidence = str(fd, "evidence");
    if (evidence) await prisma.evidence.create({ data: { ideaId: idea.id, kind: "QUOTE", content: evidence, source: optStr(fd, "evidenceSource") } });
    await audit(ctx, "idea.submitted", "idea", idea.id, `Submitted the idea "${idea.title}"`);
    id = idea.id;
  });
  if (res?.error) return res;
  refresh();
  redirect(`/app/ideas/${id}?new=1`);
}

export async function updateIdea(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("VIEWER");
    const idea = await ideaFor(ctx, str(fd, "id"));
    if (!atLeast(ctx.role, "EDITOR") && idea.submittedById !== ctx.user.id) throw new UserError("Only editors or the person who submitted it can change this idea.");
    const productId = optStr(fd, "productId");
    if (productId) await prisma.product.findFirstOrThrow({ where: { id: productId, workspaceId: ctx.workspace.id } });
    await prisma.idea.update({
      where: { id: idea.id },
      data: {
        title: need(str(fd, "title"), "Give the idea a title."),
        description: optStr(fd, "description"),
        productId,
        source: optStr(fd, "source"),
        requester: optStr(fd, "requester"),
        problemWho: optStr(fd, "problemWho"),
        problemWhat: optStr(fd, "problemWhat"),
        problemWhy: optStr(fd, "problemWhy"),
      },
    });
    refresh(idea.id);
  });
}

export async function setEffort(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const idea = await ideaFor(ctx, str(fd, "id"));
    const effort = str(fd, "effort") as Effort;
    if (!EFFORTS.includes(effort)) throw new UserError("Pick an effort size.");
    await prisma.idea.update({ where: { id: idea.id }, data: { effort, effortNote: optStr(fd, "effortNote"), effortById: ctx.user.id } });
    await audit(ctx, "idea.effort", "idea", idea.id, `Estimated "${idea.title}" as ${effort}`);
    refresh(idea.id);
    return "Effort saved. Re-run the evaluation to use it.";
  });
}

export async function addEvidence(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("VIEWER");
    const idea = await ideaFor(ctx, str(fd, "ideaId"));
    if (!atLeast(ctx.role, "CONTRIBUTOR") && idea.submittedById !== ctx.user.id) throw new UserError("Ask a contributor to add evidence.");
    const kind = str(fd, "kind") as EvidenceKind;
    await prisma.evidence.create({
      data: { ideaId: idea.id, kind: KINDS.includes(kind) ? kind : "NOTE", content: need(str(fd, "content"), "Write the evidence."), source: optStr(fd, "source") },
    });
    refresh(idea.id);
    return "Evidence added.";
  });
}

export async function deleteEvidence(id: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const ev = await prisma.evidence.findFirstOrThrow({ where: { id, idea: { workspaceId: ctx.workspace.id } } });
    await prisma.evidence.delete({ where: { id } });
    refresh(ev.ideaId);
    return "Removed.";
  });
}

export async function runEvaluation(ideaId: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const { evaluation } = await evaluateIdea(ctx, ideaId);
    await audit(ctx, "idea.evaluated", "idea", ideaId, `AI evaluated an idea: ${evaluation.recommendation.toLowerCase().replace("_", " ")}`);
    refresh(ideaId);
    return "Evaluation ready.";
  });
}

// A person's decision on an idea. Approving puts it on the roadmap as an initiative,
// linked to the objectives the idea serves.
export async function decide(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const idea = await prisma.idea.findFirstOrThrow({
      where: { id: str(fd, "ideaId"), workspaceId: ctx.workspace.id },
      include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1 }, objectives: true, initiative: true },
    });
    const outcome = str(fd, "outcome") as DecisionOutcome;
    if (!OUTCOMES.includes(outcome)) throw new UserError("Pick a decision.");
    if (outcome === "APPROVED" && ctx.role !== "ADMIN") throw new UserError("Only admins can approve ideas onto the roadmap.");
    const reason = need(str(fd, "reason"), "Say why. It's what people will read later.");
    const deferUntil = outcome === "DEFERRED" ? optDate(fd, "deferUntil") : null;
    const objectiveIds = ids(fd, "objectiveIds");
    const valid = objectiveIds.length
      ? (await prisma.objective.findMany({ where: { id: { in: objectiveIds }, workspaceId: ctx.workspace.id }, select: { id: true } })).map((o) => o.id)
      : idea.objectives.map((o) => o.objectiveId);

    await prisma.$transaction(async (tx) => {
      await tx.decision.create({
        data: {
          ideaId: idea.id,
          outcome,
          reason,
          deferUntil,
          aiRecommendation: idea.evaluations[0]?.recommendation ?? null,
          strategyVersion: ctx.workspace.strategyVersion,
          decidedById: ctx.user.id,
        },
      });
      await tx.idea.update({ where: { id: idea.id }, data: { status: outcome } });
      await tx.ideaObjective.deleteMany({ where: { ideaId: idea.id } });
      if (valid.length) await tx.ideaObjective.createMany({ data: valid.map((objectiveId) => ({ ideaId: idea.id, objectiveId })) });
      if (outcome === "APPROVED" && !idea.initiative) {
        await tx.initiative.create({
          data: {
            workspaceId: ctx.workspace.id,
            productId: idea.productId,
            ideaId: idea.id,
            title: idea.title,
            description: idea.problemWhat ?? idea.description,
            horizon: str(fd, "horizon") === "NOW" ? "NOW" : str(fd, "horizon") === "LATER" ? "LATER" : "NEXT",
            ownerId: ctx.user.id,
            objectives: valid.length ? { create: valid.map((objectiveId) => ({ objectiveId })) } : undefined,
          },
        });
      }
    });
    await audit(ctx, `idea.${outcome.toLowerCase()}`, "idea", idea.id, `${outcome === "APPROVED" ? "Approved" : outcome === "REJECTED" ? "Rejected" : outcome === "DEFERRED" ? "Deferred" : "Marked for exploring"} "${idea.title}": ${reason}`);
    refresh(idea.id);
    revalidatePath("/app/roadmap");
    revalidatePath("/app/decisions");
    return outcome === "APPROVED" ? "Approved and added to the roadmap." : "Decision recorded.";
  });
}

export async function deleteIdea(id: string): Promise<Result> {
  const res = await attempt(async () => {
    const ctx = await requireCtx("VIEWER");
    const idea = await ideaFor(ctx, id);
    if (ctx.role !== "ADMIN" && !(idea.submittedById === ctx.user.id && idea.status === "NEW")) throw new UserError("Only admins can delete ideas that have been evaluated.");
    await prisma.idea.delete({ where: { id } });
    await audit(ctx, "idea.deleted", "idea", id, `Deleted the idea "${idea.title}"`);
  });
  if (res?.error) return res;
  refresh();
  redirect("/app/ideas");
}
