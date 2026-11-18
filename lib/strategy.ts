import "server-only";
import { prisma } from "@/lib/prisma";

// The strategy a workspace is working to: vision, pillars, objectives, products and their
// OKRs. Loaded whole because it's small and every AI call needs it as context.
export async function loadStrategy(workspaceId: string) {
  const [workspace, pillars, objectives, products] = await Promise.all([
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, include: { organisation: { select: { name: true, vision: true } } } }),
    prisma.pillar.findMany({ where: { workspaceId }, orderBy: { position: "asc" } }),
    prisma.objective.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      include: {
        okrs: { include: { keyResults: { include: { checkins: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] } } }, product: { select: { name: true } } } },
        keyResults: { orderBy: { createdAt: "asc" }, include: { checkins: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] } } },
        _count: { select: { initiatives: true } },
      },
    }),
    prisma.product.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "asc" },
      include: { kpis: true, okrs: { include: { keyResults: true } } },
    }),
  ]);
  return { workspace, pillars, objectives, products };
}

export type Strategy = Awaited<ReturnType<typeof loadStrategy>>;

// A key result's progress from baseline to target, 0–100. Null when it can't be worked out.
export function krProgress(kr: { baseline: number | null; current: number | null; target: number | null }): number | null {
  if (kr.target == null || kr.current == null) return null;
  const base = kr.baseline ?? 0;
  if (kr.target === base) return kr.current >= kr.target ? 100 : 0;
  const p = ((kr.current - base) / (kr.target - base)) * 100;
  return Math.max(0, Math.min(100, Math.round(p)));
}

// An objective's progress: the average of its key results where they can be measured,
// otherwise the figure people set by hand.
type KrNums = { baseline: number | null; current: number | null; target: number | null };
export function objectiveProgress(o: { progress: number; okrs: { keyResults: KrNums[] }[]; keyResults?: KrNums[] }): number {
  const values = [...(o.keyResults ?? []), ...o.okrs.flatMap((okr) => okr.keyResults)].map(krProgress).filter((v): v is number => v !== null);
  if (values.length === 0) return o.progress;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

// Plain-text strategy, as the AI reads it. Ids are included so answers can cite them.
export function strategyText(s: Strategy): string {
  const lines: string[] = [];
  lines.push(`Organisation: ${s.workspace.organisation.name} (workspace "${s.workspace.name}")`);
  if (s.workspace.organisation.vision) lines.push(`Company vision: ${s.workspace.organisation.vision}`);
  if (s.workspace.capacityNote) lines.push(`Team capacity: ${s.workspace.capacityNote}`);
  if (s.pillars.length) {
    lines.push("Strategic pillars:");
    for (const p of s.pillars) lines.push(`- ${p.name}${p.description ? `: ${p.description}` : ""}`);
  }
  lines.push("Company objectives:");
  if (s.objectives.length === 0) lines.push("- (none set yet)");
  for (const o of s.objectives) {
    const pillar = s.pillars.find((p) => p.id === o.pillarId)?.name;
    lines.push(
      `- [objective:${o.id}] ${o.title}${o.period ? ` (${o.period})` : ""}${o.metric ? ` | measured by ${o.metric}` : ""}${o.target ? ` | target ${o.target}` : ""}${pillar ? ` | pillar ${pillar}` : ""} | status ${o.status} | progress ${objectiveProgress(o)}%`,
    );
    for (const kr of o.keyResults) {
      lines.push(`    KR: ${kr.title} (${kr.current ?? "?"} of ${kr.target ?? "?"}${kr.unit ? ` ${kr.unit}` : ""}, from ${kr.baseline ?? "?"})${kr.status ? ` ${kr.status}` : ""}${kr.leadNames ? ` | leads ${kr.leadNames}` : ""}${kr.note ? ` | update: ${kr.note.slice(0, 300).replace(/\s+/g, " ")}` : ""}`);
    }
  }
  for (const p of s.products) {
    lines.push(`Product: [product:${p.id}] ${p.name}${p.vision ? ` | vision: ${p.vision}` : ""}${p.description ? ` | ${p.description}` : ""}`);
    for (const k of p.kpis) lines.push(`  KPI: ${k.name} baseline ${k.baseline ?? "?"} current ${k.current ?? "?"} target ${k.target ?? "?"}${k.unit ? ` ${k.unit}` : ""}`);
    for (const okr of p.okrs) {
      lines.push(`  OKR (${okr.period ?? "no period"}): ${okr.title}`);
      for (const kr of okr.keyResults) lines.push(`    KR: ${kr.title} (${kr.current ?? "?"} of ${kr.target ?? "?"}${kr.unit ? ` ${kr.unit}` : ""})`);
    }
  }
  return lines.join("\n");
}

// Records a new strategy version after any change, so decisions keep the context they
// were made in.
export async function bumpStrategy(workspaceId: string, note: string) {
  const s = await loadStrategy(workspaceId);
  const next = s.workspace.strategyVersion + 1;
  const snapshot = {
    vision: s.workspace.organisation.vision,
    pillars: s.pillars.map((p) => ({ id: p.id, name: p.name })),
    objectives: s.objectives.map((o) => ({ id: o.id, title: o.title, period: o.period, metric: o.metric, target: o.target, status: o.status, keyResults: o.keyResults.map((k) => ({ title: k.title, target: k.target, unit: k.unit })) })),
    products: s.products.map((p) => ({ id: p.id, name: p.name, vision: p.vision, okrs: p.okrs.map((k) => ({ title: k.title, keyResults: k.keyResults.map((kr) => kr.title) })) })),
  };
  await prisma.$transaction([
    prisma.workspace.update({ where: { id: workspaceId }, data: { strategyVersion: next } }),
    prisma.strategyVersion.create({ data: { workspaceId, version: next, snapshot, note } }),
  ]);
  return next;
}
