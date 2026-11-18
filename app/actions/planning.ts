"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCtx, type Ctx } from "@/lib/context";
import { attempt, str, optStr, optDate, need, ids, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import type { Result } from "@/lib/result";
import type { Horizon, WorkStatus } from "@/lib/generated/prisma/enums";

const HORIZONS: Horizon[] = ["NOW", "NEXT", "LATER"];
const STATUSES: WorkStatus[] = ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "BLOCKED", "DONE"];

function refresh(id?: string) {
  revalidatePath("/app/roadmap");
  revalidatePath("/app/tasks");
  revalidatePath("/app");
  if (id) revalidatePath(`/app/initiatives/${id}`);
}

async function member(ctx: Ctx, userId: string | null) {
  if (!userId) return null;
  const m = await prisma.member.findFirst({ where: { organisationId: ctx.org.id, userId } });
  if (!m) throw new UserError("Pick someone from your team.");
  return userId;
}

async function validObjectives(ctx: Ctx, list: string[]) {
  if (!list.length) return [];
  return (await prisma.objective.findMany({ where: { id: { in: list }, workspaceId: ctx.workspace.id }, select: { id: true } })).map((o) => o.id);
}

async function initiativeFor(ctx: Ctx, id: string) {
  return prisma.initiative.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
}

// ---------- initiatives ----------

export async function createInitiative(_: Result, fd: FormData): Promise<Result> {
  let id = "";
  const res = await attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const productId = optStr(fd, "productId");
    if (productId) await prisma.product.findFirstOrThrow({ where: { id: productId, workspaceId: ctx.workspace.id } });
    const horizon = str(fd, "horizon") as Horizon;
    const objectives = await validObjectives(ctx, ids(fd, "objectiveIds"));
    const i = await prisma.initiative.create({
      data: {
        workspaceId: ctx.workspace.id,
        title: need(str(fd, "title"), "Name the initiative."),
        description: optStr(fd, "description"),
        productId,
        horizon: HORIZONS.includes(horizon) ? horizon : "NEXT",
        ownerId: await member(ctx, optStr(fd, "ownerId")),
        startDate: optDate(fd, "startDate"),
        endDate: optDate(fd, "endDate"),
        objectives: objectives.length ? { create: objectives.map((objectiveId) => ({ objectiveId })) } : undefined,
      },
    });
    await audit(ctx, "initiative.created", "initiative", i.id, `Added "${i.title}" to the roadmap (${i.horizon.toLowerCase()})${objectives.length ? "" : ", not yet linked to an objective"}`);
    id = i.id;
  });
  if (res?.error) return res;
  refresh();
  redirect(`/app/initiatives/${id}`);
}

export async function updateInitiative(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const i = await initiativeFor(ctx, str(fd, "id"));
    const productId = optStr(fd, "productId");
    if (productId) await prisma.product.findFirstOrThrow({ where: { id: productId, workspaceId: ctx.workspace.id } });
    const horizon = str(fd, "horizon") as Horizon;
    const objectives = await validObjectives(ctx, ids(fd, "objectiveIds"));
    const startDate = optDate(fd, "startDate");
    const endDate = optDate(fd, "endDate");
    if (startDate && endDate && endDate < startDate) throw new UserError("The end date is before the start date.");
    await prisma.$transaction([
      prisma.initiative.update({
        where: { id: i.id },
        data: {
          title: need(str(fd, "title"), "Name the initiative."),
          description: optStr(fd, "description"),
          productId,
          horizon: HORIZONS.includes(horizon) ? horizon : i.horizon,
          ownerId: await member(ctx, optStr(fd, "ownerId")),
          startDate,
          endDate,
        },
      }),
      prisma.initiativeObjective.deleteMany({ where: { initiativeId: i.id } }),
      prisma.initiativeObjective.createMany({ data: objectives.map((objectiveId) => ({ initiativeId: i.id, objectiveId })) }),
    ]);
    await audit(ctx, "initiative.updated", "initiative", i.id, `Updated "${i.title}"`);
    refresh(i.id);
  });
}

// Moving an item to At risk or Blocked needs a reason, so leadership knows why.
export async function setInitiativeStatus(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const i = await initiativeFor(ctx, str(fd, "id"));
    const status = str(fd, "status") as WorkStatus;
    if (!STATUSES.includes(status)) throw new UserError("Pick a status.");
    const note = optStr(fd, "note");
    if ((status === "AT_RISK" || status === "BLOCKED") && !note) throw new UserError("Say what's putting it at risk or blocking it.");
    await prisma.initiative.update({ where: { id: i.id }, data: { status, statusNote: status === "AT_RISK" || status === "BLOCKED" ? note : null } });
    await audit(ctx, "initiative.status", "initiative", i.id, `Moved "${i.title}" to ${status.toLowerCase().replace("_", " ")}${note ? `: ${note}` : ""}`);
    refresh(i.id);
    return "Status updated.";
  });
}

export async function moveInitiative(id: string, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const i = await initiativeFor(ctx, id);
    const horizon = str(fd, "horizon") as Horizon;
    if (!HORIZONS.includes(horizon)) throw new UserError("Pick Now, Next or Later.");
    await prisma.initiative.update({ where: { id }, data: { horizon } });
    await audit(ctx, "initiative.moved", "initiative", id, `Moved "${i.title}" to ${horizon.toLowerCase()}`);
    refresh(id);
  });
}

export async function deleteInitiative(id: string): Promise<Result> {
  const res = await attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const i = await initiativeFor(ctx, id);
    await prisma.initiative.delete({ where: { id } });
    await audit(ctx, "initiative.deleted", "initiative", id, `Removed "${i.title}" from the roadmap`);
  });
  if (res?.error) return res;
  refresh();
  redirect("/app/roadmap");
}

export async function savePrd(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const i = await initiativeFor(ctx, str(fd, "id"));
    await prisma.initiative.update({ where: { id: i.id }, data: { prd: optStr(fd, "prd") } });
    await audit(ctx, "initiative.prd", "initiative", i.id, `Edited the PRD for "${i.title}"`);
    refresh(i.id);
  });
}

// ---------- milestones ----------

export async function saveMilestone(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const i = await initiativeFor(ctx, str(fd, "initiativeId"));
    const id = str(fd, "id");
    const data = { title: need(str(fd, "title"), "Name the milestone."), dueDate: optDate(fd, "dueDate"), ownerId: await member(ctx, optStr(fd, "ownerId")) };
    if (id) await prisma.milestone.update({ where: { id, initiativeId: i.id }, data });
    else await prisma.milestone.create({ data: { ...data, initiativeId: i.id } });
    await audit(ctx, id ? "milestone.updated" : "milestone.created", "initiative", i.id, `${id ? "Updated" : "Added"} the milestone "${data.title}" on "${i.title}"`);
    refresh(i.id);
    return id ? "Saved." : "Milestone added.";
  });
}

export async function setMilestoneStatus(id: string, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const status = str(fd, "status") as WorkStatus;
    if (!STATUSES.includes(status)) throw new UserError("Pick a status.");
    const m = await prisma.milestone.findFirstOrThrow({ where: { id, initiative: { workspaceId: ctx.workspace.id } }, include: { initiative: true } });
    await prisma.milestone.update({ where: { id }, data: { status } });
    await audit(ctx, "milestone.status", "initiative", m.initiativeId, `Milestone "${m.title}" on "${m.initiative.title}" is now ${status.toLowerCase().replace("_", " ")}`);
    refresh(m.initiativeId);
  });
}

export async function deleteMilestone(id: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const m = await prisma.milestone.findFirstOrThrow({ where: { id, initiative: { workspaceId: ctx.workspace.id } } });
    await prisma.milestone.delete({ where: { id } });
    refresh(m.initiativeId);
    return "Removed.";
  });
}

// ---------- tasks ----------

export async function saveTask(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const i = await initiativeFor(ctx, str(fd, "initiativeId"));
    const milestoneId = optStr(fd, "milestoneId");
    if (milestoneId) await prisma.milestone.findFirstOrThrow({ where: { id: milestoneId, initiativeId: i.id } });
    await prisma.task.create({
      data: {
        initiativeId: i.id,
        milestoneId,
        title: need(str(fd, "title"), "Write the task."),
        ownerId: await member(ctx, optStr(fd, "ownerId")),
        dueDate: optDate(fd, "dueDate"),
      },
    });
    refresh(i.id);
    return "Task added.";
  });
}

export async function setTaskStatus(id: string, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const status = str(fd, "status") as WorkStatus;
    if (!STATUSES.includes(status)) throw new UserError("Pick a status.");
    const t = await prisma.task.findFirstOrThrow({ where: { id, initiative: { workspaceId: ctx.workspace.id } } });
    await prisma.task.update({ where: { id }, data: { status } });
    if (status === "DONE") await audit(ctx, "task.done", "initiative", t.initiativeId, `Finished the task "${t.title}"`);
    refresh(t.initiativeId);
  });
}

export async function toggleTask(id: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const t = await prisma.task.findFirstOrThrow({ where: { id, initiative: { workspaceId: ctx.workspace.id } } });
    const status: WorkStatus = t.status === "DONE" ? "NOT_STARTED" : "DONE";
    await prisma.task.update({ where: { id }, data: { status } });
    if (status === "DONE") await audit(ctx, "task.done", "initiative", t.initiativeId, `Finished the task "${t.title}"`);
    refresh(t.initiativeId);
    return status === "DONE" ? "Done." : "Reopened.";
  });
}

export async function deleteTask(id: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const t = await prisma.task.findFirstOrThrow({ where: { id, initiative: { workspaceId: ctx.workspace.id } } });
    await prisma.task.delete({ where: { id } });
    refresh(t.initiativeId);
    return "Removed.";
  });
}
