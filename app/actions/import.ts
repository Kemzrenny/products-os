"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireCtx } from "@/lib/context";
import { attempt, str, optDate, need, UserError } from "@/lib/action";
import { buildPlan, planSummary } from "@/lib/import/build";
import { okrPlanFromText } from "@/lib/import/ai";
import { applyOkrs, applyIdeas, applyMetrics } from "@/lib/import/apply";
import type { ImportPlan } from "@/lib/import/types";
import type { Result } from "@/lib/result";

const cell = z.union([z.string().max(5000), z.number(), z.null()]);
const payloadSchema = z.object({
  fileName: z.string().max(200),
  sheetName: z.string().max(200).nullable(),
  kind: z.enum(["OKRS", "IDEAS", "METRICS"]),
  rows: z.array(z.array(cell).max(100)).max(1200),
  headerRow: z.number().int().min(0),
  okrMapping: z.record(z.string(), z.number().int().min(0)).optional(),
  ideaMapping: z.record(z.string(), z.number().int().min(0)).optional(),
  sectionFrom: z.number().int().optional(),
  sectionTo: z.number().int().optional(),
  period: z.string().max(40).nullable(),
  year: z.number().int().min(2000).max(2100).optional(),
  asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type ImportPayload = z.infer<typeof payloadSchema>;

// Step 1: the wizard sends the chosen tab's values; the server reads them into a plan and
// keeps it for review. Nothing in the workspace changes yet.
export async function createImport(payload: ImportPayload): Promise<Result> {
  let id = "";
  const res = await attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const p = payloadSchema.parse(payload);
    const plan = buildPlan(p.rows, { ...p, period: p.period });
    if (plan.kind === "OKRS" && plan.objectives.length === 0) throw new UserError("No objectives or key results were found with those columns. Check the column matches.");
    if (plan.kind === "IDEAS" && plan.ideas.length === 0) throw new UserError("No requests were found with those columns.");
    if (plan.kind === "METRICS" && plan.series.length === 0) throw new UserError("No weekly values were found in that tab.");
    const job = await prisma.importJob.create({
      data: {
        workspaceId: ctx.workspace.id,
        createdById: ctx.user.id,
        kind: p.kind,
        fileName: p.fileName,
        sheetName: p.sheetName,
        period: plan.kind === "OKRS" ? plan.period : null,
        asOf: new Date(`${p.asOf}T12:00:00Z`),
        plan: plan as unknown as object,
        summary: planSummary(plan),
      },
    });
    id = job.id;
  });
  if (res?.error) return res;
  redirect(`/app/import/${id}`);
}

// Paste anything: the AI reads it into the same kind of plan.
export async function createImportFromText(_: Result, fd: FormData): Promise<Result> {
  let id = "";
  const res = await attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const text = need(str(fd, "text"), "Paste your OKRs first.");
    if (text.length > 60_000) throw new UserError("That's too long to read in one go. Paste one quarter at a time.");
    const plan = await okrPlanFromText(text, str(fd, "period") || null);
    if (plan.objectives.length === 0) throw new UserError("No objectives and key results could be read from that text.");
    const job = await prisma.importJob.create({
      data: {
        workspaceId: ctx.workspace.id,
        createdById: ctx.user.id,
        kind: "OKRS",
        fileName: "Pasted text",
        period: plan.period,
        asOf: optDate(fd, "asOf") ?? new Date(),
        plan: plan as unknown as object,
        summary: planSummary(plan),
      },
    });
    id = job.id;
  });
  if (res?.error) return res;
  redirect(`/app/import/${id}`);
}

// Step 2: the reviewed plan, with the person's edits, becomes real objectives, key results,
// check-ins, initiatives and ideas.
export async function applyImport(_: Result, fd: FormData): Promise<Result> {
  let to = "/app";
  const res = await attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const job = await prisma.importJob.findFirstOrThrow({ where: { id: str(fd, "id"), workspaceId: ctx.workspace.id } });
    if (job.status !== "PENDING") throw new UserError("This import has already been applied or discarded.");
    const plan = job.plan as unknown as ImportPlan;
    const asOf = optDate(fd, "asOf") ?? job.asOf;
    const label = job.sheetName ? `${job.fileName} › ${job.sheetName}` : (job.fileName ?? "an import");
    const out =
      plan.kind === "OKRS" ? await applyOkrs(ctx, plan, fd, asOf, label) : plan.kind === "IDEAS" ? await applyIdeas(ctx, plan, fd, label) : await applyMetrics(ctx, plan, fd, label);
    await prisma.importJob.update({ where: { id: job.id }, data: { status: "APPLIED", appliedAt: new Date(), summary: out.summary } });
    to = out.redirect;
  });
  if (res?.error) return res;
  revalidatePath("/app", "layout");
  redirect(`${to}${to.includes("?") ? "&" : "?"}imported=1`);
}

export async function discardImport(id: string): Promise<Result> {
  const res = await attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    await prisma.importJob.updateMany({ where: { id, workspaceId: ctx.workspace.id, status: "PENDING" }, data: { status: "DISCARDED" } });
  });
  if (res?.error) return res;
  redirect("/app/import");
}
