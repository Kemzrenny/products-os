import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runBriefing } from "@/lib/agents";
import { aiConfigured } from "@/lib/gemini";
import type { Ctx } from "@/lib/context";

export const maxDuration = 300;

// Vercel Cron, Monday 07:00 Lagos time: drafts each active workspace's leadership briefing.
// The draft waits in "Agents & drafts" until an admin approves it.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!aiConfigured()) return NextResponse.json({ skipped: "AI not configured" });

  const since = new Date(Date.now() - 7 * 86_400_000);
  const workspaces = await prisma.workspace.findMany({
    where: { auditLogs: { some: { createdAt: { gte: since } } } },
    include: { organisation: { include: { members: { where: { role: "ADMIN" }, orderBy: { createdAt: "asc" }, take: 1, include: { user: true } } } } },
  });

  const results: { workspace: string; ok: boolean; error?: string }[] = [];
  for (const ws of workspaces) {
    const admin = ws.organisation.members[0];
    if (!admin) continue;
    const already = await prisma.draft.findFirst({ where: { workspaceId: ws.id, kind: "BRIEFING", status: "PENDING", createdAt: { gte: new Date(Date.now() - 2 * 86_400_000) } } });
    if (already) continue;
    const ctx: Ctx = {
      user: { id: admin.user.id, name: admin.user.name, email: admin.user.email },
      role: "ADMIN",
      org: { id: ws.organisation.id, name: ws.organisation.name, slug: ws.organisation.slug, vision: ws.organisation.vision },
      workspace: { id: ws.id, name: ws.name, strategyVersion: ws.strategyVersion, capacityNote: ws.capacityNote },
      workspaces: [],
      orgs: [],
    };
    try {
      await runBriefing(ctx);
      results.push({ workspace: ws.id, ok: true });
    } catch (err) {
      results.push({ workspace: ws.id, ok: false, error: err instanceof Error ? err.message : "failed" });
    }
  }
  return NextResponse.json({ drafted: results.filter((r) => r.ok).length, results });
}
