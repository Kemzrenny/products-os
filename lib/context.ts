import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { readSession, AuthError, type SessionUser } from "@/lib/auth";
import { atLeast } from "@/lib/roles";
import type { Role } from "@/lib/generated/prisma/enums";

// Who is asking, in which organisation and workspace, with which role. The active
// organisation and workspace are remembered in cookies; anything stale falls back to the
// person's first membership.

export const ORG_COOKIE = "pos_org";
export const WS_COOKIE = "pos_ws";

export type Ctx = {
  user: SessionUser;
  role: Role;
  org: { id: string; name: string; slug: string; vision: string | null };
  workspace: { id: string; name: string; strategyVersion: number; capacityNote: string | null };
  workspaces: { id: string; name: string }[];
  orgs: { id: string; name: string }[];
};

const load = cache(async (): Promise<Ctx | "no-session" | "no-org"> => {
  const user = await readSession();
  if (!user) return "no-session";
  const store = await cookies();
  const memberships = await prisma.member.findMany({
    where: { userId: user.id },
    include: { organisation: { include: { workspaces: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, strategyVersion: true, capacityNote: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) return "no-org";
  const wanted = store.get(ORG_COOKIE)?.value;
  const member = memberships.find((m) => m.organisationId === wanted) ?? memberships[0];
  const org = member.organisation;
  if (org.workspaces.length === 0) return "no-org";
  const ws = org.workspaces.find((w) => w.id === store.get(WS_COOKIE)?.value) ?? org.workspaces[0];
  return {
    user,
    role: member.role,
    org: { id: org.id, name: org.name, slug: org.slug, vision: org.vision },
    workspace: ws,
    workspaces: org.workspaces.map((w) => ({ id: w.id, name: w.name })),
    orgs: memberships.map((m) => ({ id: m.organisation.id, name: m.organisation.name })),
  };
});

// For pages.
export async function getCtx(min: Role = "VIEWER"): Promise<Ctx> {
  const c = await load();
  if (c === "no-session") redirect("/login");
  if (c === "no-org") redirect("/onboarding");
  if (!atLeast(c.role, min)) redirect("/app?denied=1");
  return c;
}

// For server actions: throws instead of redirecting.
export async function requireCtx(min: Role = "VIEWER"): Promise<Ctx> {
  const c = await load();
  if (c === "no-session") throw new AuthError(401, "Please sign in again.");
  if (c === "no-org") throw new AuthError(403, "Set up your organisation first.");
  if (!atLeast(c.role, min)) throw new AuthError(403, "Your role doesn't allow that. Ask an admin.");
  return c;
}
