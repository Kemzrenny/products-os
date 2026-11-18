"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCtx } from "@/lib/context";
import { attempt, str, optStr, optNum, optDate, need, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { bumpStrategy } from "@/lib/strategy";
import type { Result } from "@/lib/result";
import type { ObjectiveStatus } from "@/lib/generated/prisma/enums";

const STATUSES: ObjectiveStatus[] = ["ON_TRACK", "AT_RISK", "OFF_TRACK", "DONE"];

function done() {
  revalidatePath("/app/strategy");
  revalidatePath("/app");
}

// ---------- pillars ----------

export async function savePillar(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const id = str(fd, "id");
    const data = { name: need(str(fd, "name"), "Name the pillar."), description: optStr(fd, "description") };
    if (id) await prisma.pillar.update({ where: { id, workspaceId: ctx.workspace.id }, data });
    else {
      const position = await prisma.pillar.count({ where: { workspaceId: ctx.workspace.id } });
      await prisma.pillar.create({ data: { ...data, position, workspaceId: ctx.workspace.id } });
    }
    await bumpStrategy(ctx.workspace.id, `Pillar "${data.name}" ${id ? "updated" : "added"}`);
    await audit(ctx, id ? "pillar.updated" : "pillar.created", "pillar", id || null, `${id ? "Updated" : "Added"} the strategic pillar "${data.name}"`);
    done();
    return id ? "Saved." : "Pillar added.";
  });
}

export async function deletePillar(id: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const p = await prisma.pillar.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
    await prisma.pillar.delete({ where: { id } });
    await bumpStrategy(ctx.workspace.id, `Pillar "${p.name}" removed`);
    await audit(ctx, "pillar.deleted", "pillar", id, `Removed the strategic pillar "${p.name}"`);
    done();
    return "Removed.";
  });
}

// ---------- company objectives ----------

export async function saveObjective(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const id = str(fd, "id");
    const pillarId = optStr(fd, "pillarId");
    if (pillarId) await prisma.pillar.findFirstOrThrow({ where: { id: pillarId, workspaceId: ctx.workspace.id } });
    const data = {
      title: need(str(fd, "title"), "Write the objective."),
      description: optStr(fd, "description"),
      metric: optStr(fd, "metric"),
      target: optStr(fd, "target"),
      dueDate: optDate(fd, "dueDate"),
      pillarId,
    };
    let objectiveId = id;
    if (id) await prisma.objective.update({ where: { id, workspaceId: ctx.workspace.id }, data });
    else objectiveId = (await prisma.objective.create({ data: { ...data, workspaceId: ctx.workspace.id } })).id;
    const version = await bumpStrategy(ctx.workspace.id, `Objective "${data.title}" ${id ? "updated" : "added"}`);
    await audit(ctx, id ? "objective.updated" : "objective.created", "objective", objectiveId, `${id ? "Updated" : "Added"} the objective "${data.title}" (strategy v${version})`);
    done();
    return id ? "Saved." : "Objective added.";
  });
}

export async function setObjectiveStatus(id: string, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const status = str(fd, "status") as ObjectiveStatus;
    if (!STATUSES.includes(status)) throw new UserError("Pick a status.");
    const o = await prisma.objective.update({ where: { id, workspaceId: ctx.workspace.id }, data: { status } });
    await audit(ctx, "objective.status", "objective", id, `Marked "${o.title}" ${status.toLowerCase().replace("_", " ")}`);
    done();
  });
}

export async function setObjectiveProgress(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const id = str(fd, "id");
    const progress = optNum(fd, "progress");
    if (progress == null || progress < 0 || progress > 100) throw new UserError("Progress is a number from 0 to 100.");
    const o = await prisma.objective.update({ where: { id, workspaceId: ctx.workspace.id }, data: { progress: Math.round(progress) } });
    await audit(ctx, "objective.progress", "objective", id, `Set "${o.title}" progress to ${Math.round(progress)}%`);
    done();
  });
}

export async function deleteObjective(id: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const o = await prisma.objective.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
    await prisma.objective.delete({ where: { id } });
    await bumpStrategy(ctx.workspace.id, `Objective "${o.title}" removed`);
    await audit(ctx, "objective.deleted", "objective", id, `Removed the objective "${o.title}"`);
    done();
    return "Removed.";
  });
}

// ---------- product OKRs ----------

export async function saveOkr(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const productId = need(str(fd, "productId"), "Pick a product.");
    await prisma.product.findFirstOrThrow({ where: { id: productId, workspaceId: ctx.workspace.id } });
    const objectiveId = optStr(fd, "objectiveId");
    if (objectiveId) await prisma.objective.findFirstOrThrow({ where: { id: objectiveId, workspaceId: ctx.workspace.id } });
    const id = str(fd, "id");
    const data = { title: need(str(fd, "title"), "Write the OKR objective."), period: optStr(fd, "period"), objectiveId, productId };
    if (id) await prisma.okr.update({ where: { id, product: { workspaceId: ctx.workspace.id } }, data });
    else await prisma.okr.create({ data });
    await bumpStrategy(ctx.workspace.id, `OKR "${data.title}" ${id ? "updated" : "added"}`);
    await audit(ctx, id ? "okr.updated" : "okr.created", "okr", id || null, `${id ? "Updated" : "Added"} the OKR "${data.title}"`);
    done();
    return id ? "Saved." : "OKR added.";
  });
}

export async function deleteOkr(id: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const okr = await prisma.okr.findFirstOrThrow({ where: { id, product: { workspaceId: ctx.workspace.id } } });
    await prisma.okr.delete({ where: { id } });
    await bumpStrategy(ctx.workspace.id, `OKR "${okr.title}" removed`);
    done();
    return "Removed.";
  });
}

export async function saveKeyResult(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const okrId = str(fd, "okrId");
    const okr = await prisma.okr.findFirstOrThrow({ where: { id: okrId, product: { workspaceId: ctx.workspace.id } } });
    const kpiId = optStr(fd, "kpiId");
    if (kpiId) await prisma.kpi.findFirstOrThrow({ where: { id: kpiId, productId: okr.productId } });
    const id = str(fd, "id");
    const data = {
      title: need(str(fd, "title"), "Write the key result."),
      kpiId,
      baseline: optNum(fd, "baseline"),
      current: optNum(fd, "current"),
      target: optNum(fd, "target"),
      unit: optStr(fd, "unit"),
    };
    if (id) await prisma.keyResult.update({ where: { id, okrId }, data });
    else await prisma.keyResult.create({ data: { ...data, okrId } });
    if (!id) await bumpStrategy(ctx.workspace.id, `Key result "${data.title}" added`);
    await audit(ctx, id ? "kr.updated" : "kr.created", "keyResult", id || null, `${id ? "Updated" : "Added"} the key result "${data.title}"${data.current != null ? ` (now ${data.current})` : ""}`);
    done();
    return id ? "Saved." : "Key result added.";
  });
}

export async function deleteKeyResult(id: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    await prisma.keyResult.deleteMany({ where: { id, okr: { product: { workspaceId: ctx.workspace.id } } } });
    done();
    return "Removed.";
  });
}
