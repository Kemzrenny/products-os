"use server";

import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";
import { requireCtx, ORG_COOKIE, WS_COOKIE } from "@/lib/context";
import { attempt, str, optStr, optNum, optDate, need, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { bumpStrategy } from "@/lib/strategy";
import { recordReading } from "@/lib/checkins";
import type { Result } from "@/lib/result";
import type { Role } from "@/lib/generated/prisma/enums";

const ROLES: Role[] = ["ADMIN", "EDITOR", "CONTRIBUTOR", "VIEWER"];
const yearCookie = { path: "/", maxAge: 31536000, sameSite: "lax" as const };

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "org"
  );
}

// ---------- onboarding ----------

export async function createOrganisation(_: Result, fd: FormData): Promise<Result> {
  const user = await currentUser();
  const res = await attempt(async () => {
    const name = need(str(fd, "org"), "Name your organisation.");
    const workspace = str(fd, "workspace") || "Product";
    const product = str(fd, "product");
    let slug = slugify(name);
    if (await prisma.organisation.findUnique({ where: { slug } })) slug = `${slug}-${randomBytes(3).toString("hex")}`;
    const org = await prisma.organisation.create({
      data: {
        name,
        slug,
        vision: optStr(fd, "vision"),
        members: { create: { userId: user.id, role: "ADMIN" } },
        workspaces: { create: { name: workspace, products: product ? { create: { name: product } } : undefined } },
      },
      include: { workspaces: true },
    });
    const store = await cookies();
    store.set(ORG_COOKIE, org.id, yearCookie);
    store.set(WS_COOKIE, org.workspaces[0].id, yearCookie);
    await bumpStrategy(org.workspaces[0].id, "Workspace created");
  });
  if (res?.error) return res;
  redirect("/app/import?welcome=1");
}

// ---------- switching ----------

export async function switchWorkspace(fd: FormData) {
  const ctx = await requireCtx();
  const id = str(fd, "workspace");
  if (ctx.workspaces.some((w) => w.id === id)) (await cookies()).set(WS_COOKIE, id, yearCookie);
  redirect("/app");
}

export async function switchOrg(fd: FormData) {
  const ctx = await requireCtx();
  const id = str(fd, "org");
  if (ctx.orgs.some((o) => o.id === id)) {
    const store = await cookies();
    store.set(ORG_COOKIE, id, yearCookie);
    store.delete(WS_COOKIE);
  }
  redirect("/app");
}

// ---------- organisation & workspace ----------

export async function updateOrganisation(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const name = need(str(fd, "name"), "Name your organisation.");
    const vision = optStr(fd, "vision");
    await prisma.organisation.update({ where: { id: ctx.org.id }, data: { name, vision } });
    if (vision !== ctx.org.vision) await bumpStrategy(ctx.workspace.id, "Company vision updated");
    await audit(ctx, "org.updated", "organisation", ctx.org.id, "Updated the organisation details");
    revalidatePath("/app", "layout");
  });
}

export async function createWorkspace(_: Result, fd: FormData): Promise<Result> {
  const res = await attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const ws = await prisma.workspace.create({ data: { organisationId: ctx.org.id, name: need(str(fd, "name"), "Name the workspace.") } });
    await bumpStrategy(ws.id, "Workspace created");
    (await cookies()).set(WS_COOKIE, ws.id, yearCookie);
  });
  if (res?.error) return res;
  redirect("/app/strategy");
}

export async function updateWorkspace(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    await prisma.workspace.update({
      where: { id: ctx.workspace.id },
      data: { name: need(str(fd, "name"), "Name the workspace."), capacityNote: optStr(fd, "capacity") },
    });
    revalidatePath("/app", "layout");
  });
}

// ---------- products & KPIs ----------

export async function saveProduct(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const id = str(fd, "id");
    const data = { name: need(str(fd, "name"), "Name the product."), description: optStr(fd, "description"), vision: optStr(fd, "vision") };
    if (id) {
      const before = await prisma.product.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
      await prisma.product.update({ where: { id }, data });
      if (before.vision !== data.vision || before.name !== data.name) await bumpStrategy(ctx.workspace.id, `Product "${data.name}" updated`);
    } else {
      const p = await prisma.product.create({ data: { ...data, workspaceId: ctx.workspace.id } });
      await bumpStrategy(ctx.workspace.id, `Product "${p.name}" added`);
      await audit(ctx, "product.created", "product", p.id, `Added the product "${p.name}"`);
    }
    revalidatePath("/app/products");
    return id ? "Saved." : "Product added.";
  });
}

export async function deleteProduct(id: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const p = await prisma.product.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
    await prisma.product.delete({ where: { id } });
    await bumpStrategy(ctx.workspace.id, `Product "${p.name}" removed`);
    await audit(ctx, "product.deleted", "product", id, `Removed the product "${p.name}"`);
    revalidatePath("/app/products");
    return "Removed.";
  });
}

export async function saveKpi(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const productId = str(fd, "productId");
    await prisma.product.findFirstOrThrow({ where: { id: productId, workspaceId: ctx.workspace.id } });
    const id = str(fd, "id");
    const data = {
      name: need(str(fd, "name"), "Name the KPI."),
      unit: optStr(fd, "unit"),
      baseline: optNum(fd, "baseline"),
      current: optNum(fd, "current"),
      target: optNum(fd, "target"),
      dueDate: optDate(fd, "dueDate"),
    };
    const { current, ...rest } = data;
    if (id) {
      const before = await prisma.kpi.findFirstOrThrow({ where: { id, productId } });
      await prisma.$transaction(async (tx) => {
        await tx.kpi.update({ where: { id }, data: rest });
        if (current !== null && current !== before.current) await recordReading(tx, { kpiId: id }, { value: current, date: optDate(fd, "asOf") ?? new Date(), userId: ctx.user.id });
      });
      await audit(ctx, "kpi.updated", "kpi", id, `Updated the KPI "${data.name}"${data.current != null ? ` (now ${data.current}${data.unit ?? ""})` : ""}`);
    } else {
      const k = await prisma.kpi.create({ data: { ...rest, productId } });
      if (current !== null) await recordReading(prisma, { kpiId: k.id }, { value: current, date: new Date(), userId: ctx.user.id });
      await audit(ctx, "kpi.created", "kpi", k.id, `Added the KPI "${k.name}"`);
    }
    revalidatePath("/app/products");
    return id ? "Saved." : "KPI added.";
  });
}

export async function deleteKpi(id: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    await prisma.kpi.deleteMany({ where: { id, product: { workspaceId: ctx.workspace.id } } });
    revalidatePath("/app/products");
    return "Removed.";
  });
}

// ---------- team ----------

export async function inviteMember(_: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const email = need(str(fd, "email").toLowerCase(), "Enter their email.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new UserError("That email doesn't look right.");
    const role = str(fd, "role") as Role;
    if (!ROLES.includes(role)) throw new UserError("Pick a role.");
    const existing = await prisma.member.findFirst({ where: { organisationId: ctx.org.id, user: { email } } });
    if (existing) throw new UserError("They're already in this organisation.");
    const token = randomBytes(18).toString("base64url");
    await prisma.invitation.upsert({
      where: { organisationId_email: { organisationId: ctx.org.id, email } },
      create: { organisationId: ctx.org.id, email, role, token, invitedById: ctx.user.id },
      update: { role, token, acceptedAt: null, invitedById: ctx.user.id },
    });
    await audit(ctx, "member.invited", "invitation", null, `Invited ${email} as ${role.toLowerCase()}`);
    revalidatePath("/app/settings");
    return "Invite created. Copy the link below and send it to them.";
  });
}

export async function revokeInvite(id: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    await prisma.invitation.deleteMany({ where: { id, organisationId: ctx.org.id } });
    revalidatePath("/app/settings");
    return "Invite cancelled.";
  });
}

export async function changeRole(memberId: string, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const role = str(fd, "role") as Role;
    if (!ROLES.includes(role)) throw new UserError("Pick a role.");
    const member = await prisma.member.findFirstOrThrow({ where: { id: memberId, organisationId: ctx.org.id }, include: { user: true } });
    if (member.role === "ADMIN" && role !== "ADMIN") {
      const admins = await prisma.member.count({ where: { organisationId: ctx.org.id, role: "ADMIN" } });
      if (admins <= 1) throw new UserError("Keep at least one admin.");
    }
    await prisma.member.update({ where: { id: memberId }, data: { role } });
    await audit(ctx, "member.role", "member", memberId, `Made ${member.user.name} ${role.toLowerCase()}`);
    revalidatePath("/app/settings");
    return "Role updated.";
  });
}

export async function removeMember(memberId: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("ADMIN");
    const member = await prisma.member.findFirstOrThrow({ where: { id: memberId, organisationId: ctx.org.id }, include: { user: true } });
    if (member.userId === ctx.user.id) throw new UserError("You can't remove yourself.");
    if (member.role === "ADMIN" && (await prisma.member.count({ where: { organisationId: ctx.org.id, role: "ADMIN" } })) <= 1) {
      throw new UserError("Keep at least one admin.");
    }
    await prisma.member.delete({ where: { id: memberId } });
    await audit(ctx, "member.removed", "member", memberId, `Removed ${member.user.name} from the team`);
    revalidatePath("/app/settings");
    return "Removed.";
  });
}
