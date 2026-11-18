import "server-only";
import { prisma } from "@/lib/prisma";
import { objectiveProgress } from "@/lib/strategy";

export type RiskReason = string;

// Why an initiative needs attention. Empty means it's fine.
export function riskReasons(
  i: { status: string; statusNote: string | null; endDate: Date | null; objectives: unknown[]; milestones: { status: string; dueDate: Date | null; title: string }[] },
  now = new Date(),
): RiskReason[] {
  if (i.status === "DONE") return [];
  const out: RiskReason[] = [];
  if (i.status === "BLOCKED") out.push(`Blocked${i.statusNote ? `: ${i.statusNote}` : ""}`);
  if (i.status === "AT_RISK") out.push(`At risk${i.statusNote ? `: ${i.statusNote}` : ""}`);
  if (i.endDate && i.endDate < now) out.push("Past its end date");
  const overdue = i.milestones.filter((m) => m.status !== "DONE" && m.dueDate && m.dueDate < now);
  if (overdue.length) out.push(`${overdue.length} overdue milestone${overdue.length === 1 ? "" : "s"} (${overdue[0].title})`);
  if (i.objectives.length === 0) out.push("Not linked to any objective");
  return out;
}

export async function commandCentre(workspaceId: string) {
  const [objectives, initiatives, products, pendingIdeas, pendingDrafts, latestBriefing, recent] = await Promise.all([
    prisma.objective.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, include: { okrs: { include: { keyResults: true } }, _count: { select: { initiatives: true } } } }),
    prisma.initiative.findMany({
      where: { workspaceId },
      orderBy: [{ horizon: "asc" }, { position: "asc" }, { createdAt: "asc" }],
      include: {
        objectives: { select: { objectiveId: true } },
        milestones: { select: { status: true, dueDate: true, title: true } },
        tasks: { select: { status: true } },
        owner: { select: { name: true } },
        product: { select: { id: true, name: true } },
      },
    }),
    prisma.product.findMany({ where: { workspaceId }, orderBy: { createdAt: "asc" }, include: { kpis: true } }),
    prisma.idea.findMany({
      where: { workspaceId, status: { in: ["NEW", "EVALUATED"] } },
      orderBy: [{ rank: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 8,
      include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1, select: { recommendation: true } } },
    }),
    prisma.draft.findMany({ where: { workspaceId, status: "PENDING" }, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.briefing.findFirst({ where: { workspaceId }, orderBy: { createdAt: "desc" } }),
    prisma.auditLog.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 8, include: { user: { select: { name: true } } } }),
  ]);

  const now = new Date();
  const withRisk = initiatives.map((i) => {
    const total = i.milestones.length + i.tasks.length;
    const done = i.milestones.filter((m) => m.status === "DONE").length + i.tasks.filter((t) => t.status === "DONE").length;
    return { ...i, risks: riskReasons(i, now), progress: i.status === "DONE" ? 100 : total ? Math.round((done / total) * 100) : 0 };
  });

  const statusCounts = { NOT_STARTED: 0, IN_PROGRESS: 0, AT_RISK: 0, BLOCKED: 0, DONE: 0 } as Record<string, number>;
  for (const i of initiatives) statusCounts[i.status]++;

  return {
    objectives: objectives.map((o) => ({ ...o, computed: objectiveProgress(o) })),
    initiatives: withRisk,
    atRisk: withRisk.filter((i) => i.risks.length > 0),
    statusCounts,
    products: products.map((p) => ({
      ...p,
      initiatives: withRisk.filter((i) => i.product?.id === p.id),
    })),
    pendingIdeas,
    pendingDrafts,
    latestBriefing,
    recent,
  };
}
