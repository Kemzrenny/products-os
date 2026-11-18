import "server-only";
import { prisma } from "@/lib/prisma";
import { recordReading } from "@/lib/checkins";
import { bumpStrategy } from "@/lib/strategy";
import { audit } from "@/lib/audit";
import { UserError, str, optNum } from "@/lib/action";
import type { Ctx } from "@/lib/context";
import type { OkrPlan, IdeaPlan, MetricsPlan, WorkState } from "./types";
import { quarterOf, quarterRange, names as splitNames } from "./values";
import { initiativeTitle } from "./okr";
import type { ObjectiveStatus } from "@/lib/generated/prisma/enums";

// Applying a reviewed import. The plan is what was read from the file; the form carries the
// person's edits and choices from the preview. Re-importing the same file updates what's
// there instead of duplicating it.

const WORK: WorkState[] = ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "BLOCKED", "DONE"];
const on = (fd: FormData, k: string) => fd.get(k) === "on";
const day = (s: string | null) => (s ? new Date(`${s}T12:00:00Z`) : null);

async function teamMatcher(orgId: string) {
  const members = await prisma.member.findMany({ where: { organisationId: orgId }, include: { user: { select: { id: true, name: true } } } });
  return (raw: string): { id: string; name: string } | null => {
    const n = raw.trim().toLowerCase();
    if (!n) return null;
    const exact = members.find((m) => m.user.name.toLowerCase() === n);
    if (exact) return exact.user;
    const first = members.filter((m) => m.user.name.toLowerCase().split(/\s+/)[0] === n.split(/\s+/)[0]);
    return first.length === 1 ? first[0].user : null;
  };
}
export { teamMatcher };

export function periodStart(period: string | null, asOf: Date): Date | null {
  const q = quarterOf(period);
  if (!q) return null;
  return new Date(`${quarterRange(q.q, q.year ?? asOf.getUTCFullYear()).start}T12:00:00Z`);
}

export async function applyOkrs(ctx: Ctx, plan: OkrPlan, fd: FormData, asOf: Date, fileLabel: string) {
  const period = str(fd, "period") || plan.period;
  const start = on(fd, "baselineCheckin") ? periodStart(period, asOf) : null;
  const makeInitiatives = on(fd, "createInitiatives");
  const match = await teamMatcher(ctx.org.id);
  let objectives = 0;
  let krs = 0;
  let initiatives = 0;

  for (const [oi, o] of plan.objectives.entries()) {
    if (!on(fd, `o${oi}.include`)) continue;
    const included = o.keyResults.map((k, ki) => ({ k, ki })).filter(({ ki }) => on(fd, `k${oi}_${ki}.include`));
    if (!included.length) continue;
    const title = str(fd, `o${oi}.title`) || o.title;

    // The same objective in the same period is updated, not duplicated.
    let objective = await prisma.objective.findFirst({ where: { workspaceId: ctx.workspace.id, title: { equals: title, mode: "insensitive" }, OR: [{ period }, { period: null }] } });
    const dues = included.map(({ k, ki }) => str(fd, `k${oi}_${ki}.due`) || k.due).filter(Boolean).sort() as string[];
    if (objective) objective = await prisma.objective.update({ where: { id: objective.id }, data: { period: period ?? objective.period } });
    else objective = await prisma.objective.create({ data: { workspaceId: ctx.workspace.id, title, period, dueDate: day(dues.at(-1) ?? null) } });
    objectives++;

    const statuses: (WorkState | null)[] = [];
    for (const { k, ki } of included) {
      const f = `k${oi}_${ki}`;
      const status = (WORK as string[]).includes(str(fd, `${f}.status`)) ? (str(fd, `${f}.status`) as WorkState) : null;
      statuses.push(status);
      const leads = splitNames(str(fd, `${f}.leads`));
      const data = {
        title: str(fd, `${f}.title`) || k.title,
        baseline: optNum(fd, `${f}.baseline`),
        target: optNum(fd, `${f}.target`),
        unit: str(fd, `${f}.unit`) || null,
        status,
        leadNames: leads.join(", ") || null,
        dueDate: day(str(fd, `${f}.due`) || null),
        note: k.comment,
      };
      const current = optNum(fd, `${f}.current`);
      await prisma.$transaction(async (tx) => {
        const existing = await tx.keyResult.findFirst({ where: { objectiveId: objective.id, title: { equals: data.title, mode: "insensitive" } } });
        const kr = existing ? await tx.keyResult.update({ where: { id: existing.id }, data }) : await tx.keyResult.create({ data: { ...data, objectiveId: objective.id, current: data.baseline } });
        // The starting value at the start of the quarter, then where it stands now.
        if (start && data.baseline !== null && start < asOf) {
          const has = await tx.checkin.findFirst({ where: { keyResultId: kr.id, date: start } });
          if (!has) await recordReading(tx, { keyResultId: kr.id }, { value: data.baseline, date: start, note: "Starting value (imported)", source: "import", userId: ctx.user.id });
        }
        if (current !== null) {
          await tx.checkin.deleteMany({ where: { keyResultId: kr.id, date: asOf, source: "import" } });
          await recordReading(tx, { keyResultId: kr.id }, { value: current, date: asOf, note: k.comment ? k.comment.slice(0, 1000) : `Imported from ${fileLabel}`, source: "import", userId: ctx.user.id });
        }
      });
      krs++;

      // The key result's plan becomes an initiative on the roadmap, tied to the objective.
      const iTitle = str(fd, `${f}.initiative`) || (k.plan ? initiativeTitle(k) : "");
      if (makeInitiatives && iTitle && k.plan) {
        const owner = leads.map(match).find(Boolean) ?? null;
        const s: WorkState = status ?? "NOT_STARTED";
        const note = s === "AT_RISK" || s === "BLOCKED" ? (k.comment?.split("\n").find((x) => x.trim()) ?? "Marked in the imported sheet").slice(0, 300) : null;
        const description = [k.plan, k.deliverable ? `Deliverable: ${k.deliverable}` : null, `Key result: ${data.title}`].filter(Boolean).join("\n\n");
        const existing = await prisma.initiative.findFirst({ where: { workspaceId: ctx.workspace.id, title: { equals: iTitle, mode: "insensitive" } } });
        if (existing) {
          await prisma.initiative.update({ where: { id: existing.id }, data: { status: s, statusNote: note, endDate: data.dueDate ?? existing.endDate } });
        } else {
          await prisma.initiative.create({
            data: {
              workspaceId: ctx.workspace.id,
              title: iTitle,
              description,
              horizon: "NOW",
              status: s,
              statusNote: note,
              endDate: data.dueDate,
              startDate: start,
              ownerId: owner?.id ?? null,
              leadNames: data.leadNames,
              objectives: { create: { objectiveId: objective.id } },
            },
          });
          initiatives++;
        }
      }
    }
    // The objective's status follows its key results.
    const objStatus: ObjectiveStatus = statuses.length && statuses.every((s) => s === "DONE") ? "DONE" : statuses.some((s) => s === "BLOCKED" || s === "AT_RISK") ? "AT_RISK" : "ON_TRACK";
    await prisma.objective.update({ where: { id: objective.id }, data: { status: objStatus } });
  }
  if (!objectives) throw new UserError("Tick at least one objective and key result to import.");
  const version = await bumpStrategy(ctx.workspace.id, `Imported ${objectives} objectives from ${fileLabel}${period ? ` (${period})` : ""}`);
  const summary = `Imported ${objectives} objective${objectives === 1 ? "" : "s"}, ${krs} key result${krs === 1 ? "" : "s"}${initiatives ? ` and ${initiatives} initiative${initiatives === 1 ? "" : "s"}` : ""} from ${fileLabel}${period ? ` for ${period}` : ""}, with progress as of ${asOf.toISOString().slice(0, 10)}`;
  await audit(ctx, "import.okrs", "import", null, `${summary} (strategy v${version})`);
  return { summary, redirect: `/app/strategy${period ? `?period=${encodeURIComponent(period)}` : ""}` };
}

export async function applyIdeas(ctx: Ctx, plan: IdeaPlan, fd: FormData, fileLabel: string) {
  // Categories → products, as chosen in the preview.
  const productFor = new Map<string, string | null>();
  for (let c = 0; fd.has(`cat${c}.name`); c++) {
    const name = str(fd, `cat${c}.name`);
    const to = str(fd, `cat${c}.to`);
    if (to.startsWith("product:")) {
      const id = to.slice(8);
      await prisma.product.findFirstOrThrow({ where: { id, workspaceId: ctx.workspace.id } });
      productFor.set(name, id);
    } else if (to === "create") {
      const existing = await prisma.product.findFirst({ where: { workspaceId: ctx.workspace.id, name: { equals: name, mode: "insensitive" } } });
      productFor.set(name, existing?.id ?? (await prisma.product.create({ data: { workspaceId: ctx.workspace.id, name } })).id);
    } else productFor.set(name, null);
  }
  let created = 0;
  let updated = 0;
  for (const [n, idea] of plan.ideas.entries()) {
    if (!on(fd, `i${n}.include`)) continue;
    const title = str(fd, `i${n}.title`) || idea.title;
    const category = idea.category?.split(",")[0].trim() ?? "";
    const productId = productFor.get(category) ?? null;
    const data = {
      title,
      description: idea.description,
      productId,
      source: `Imported: ${fileLabel}`,
      requester: idea.requester,
      priority: idea.priority,
      requestType: idea.type,
      status: idea.status,
    };
    const existing = idea.externalId ? await prisma.idea.findFirst({ where: { workspaceId: ctx.workspace.id, externalId: idea.externalId } }) : null;
    if (existing) {
      await prisma.idea.update({ where: { id: existing.id }, data });
      updated++;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const created = await tx.idea.create({
        data: { ...data, workspaceId: ctx.workspace.id, externalId: idea.externalId, submittedById: ctx.user.id, ...(idea.date ? { createdAt: day(idea.date)! } : {}) },
      });
      // Decisions made before Products OS are recorded as they stand, not re-judged.
      if (idea.status !== "NEW") {
        await tx.decision.create({
          data: {
            ideaId: created.id,
            outcome: idea.status,
            reason: [`Recorded at import: marked "${idea.rawStatus ?? idea.status}" in ${fileLabel}.`, idea.resolution].filter(Boolean).join(" "),
            strategyVersion: ctx.workspace.strategyVersion,
            decidedById: ctx.user.id,
            recordedAtImport: true,
          },
        });
      }
    });
    created++;
  }
  if (!created && !updated) throw new UserError("Tick at least one request to import.");
  const summary = `Imported ${created} idea${created === 1 ? "" : "s"}${updated ? ` and updated ${updated} already imported` : ""} from ${fileLabel}`;
  await audit(ctx, "import.ideas", "import", null, summary);
  return { summary, redirect: "/app/ideas?tab=all" };
}

export async function applyMetrics(ctx: Ctx, plan: MetricsPlan, fd: FormData, fileLabel: string) {
  let series = 0;
  let readings = 0;
  for (const [n, s] of plan.series.entries()) {
    const to = str(fd, `s${n}.to`);
    if (!to || to === "skip" || s.points.length === 0) continue;
    let target: { keyResultId: string } | { kpiId: string };
    if (to.startsWith("kr:")) {
      const kr = await prisma.keyResult.findFirstOrThrow({ where: { id: to.slice(3), OR: [{ objective: { workspaceId: ctx.workspace.id } }, { okr: { product: { workspaceId: ctx.workspace.id } } }] } });
      target = { keyResultId: kr.id };
    } else if (to.startsWith("kpi:")) {
      const product = await prisma.product.findFirstOrThrow({ where: { id: to.slice(4), workspaceId: ctx.workspace.id } });
      const existing = await prisma.kpi.findFirst({ where: { productId: product.id, name: { equals: s.name, mode: "insensitive" } } });
      const kpi = existing ?? (await prisma.kpi.create({ data: { productId: product.id, name: s.name, unit: s.unit, target: s.target, baseline: s.points[0]?.value ?? null } }));
      target = { kpiId: kpi.id };
    } else continue;
    await prisma.$transaction(async (tx) => {
      for (const p of s.points) {
        const date = day(p.date)!;
        await tx.checkin.deleteMany({ where: { ...target, date, source: "import" } });
        await recordReading(tx, target, { value: p.value, date, note: `${p.label} (imported from ${fileLabel})`, source: "import", userId: ctx.user.id });
        readings++;
      }
    });
    series++;
  }
  if (!series) throw new UserError("Choose where at least one metric's history should go.");
  const summary = `Imported ${readings} weekly reading${readings === 1 ? "" : "s"} for ${series} metric${series === 1 ? "" : "s"} from ${fileLabel}`;
  await audit(ctx, "import.metrics", "import", null, summary);
  return { summary, redirect: "/app/strategy" };
}
