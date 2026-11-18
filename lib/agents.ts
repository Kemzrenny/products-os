import "server-only";
import { z } from "zod";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { aiJson, AiError } from "@/lib/gemini";
import { loadStrategy, strategyText, objectiveProgress } from "@/lib/strategy";
import type { Ctx } from "@/lib/context";
import type { AgentKind, Recommendation } from "@/lib/generated/prisma/enums";
import { Prisma } from "@/lib/generated/prisma/client";

// The AI workforce. Every agent reads the same context (strategy, ideas, roadmap,
// decisions) and cites the objects it used. Evaluations are advice shown on the idea;
// everything else lands as a Draft that a person must approve before anything changes.

export type Source = { type: "objective" | "idea" | "initiative" | "product" | "decision"; id: string; label: string; href: string };

const LEVEL = z.enum(["HIGH", "MEDIUM", "LOW"]);

// ---------- shared context ----------

async function workspaceContext(workspaceId: string) {
  const [strategy, ideas, initiatives, decisions] = await Promise.all([
    loadStrategy(workspaceId),
    prisma.idea.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { evaluations: { orderBy: { createdAt: "desc" }, take: 1 }, product: { select: { name: true } }, _count: { select: { evidence: true } } },
    }),
    prisma.initiative.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { objectives: { select: { objectiveId: true } }, owner: { select: { name: true } }, milestones: { select: { title: true, status: true, dueDate: true } } },
    }),
    prisma.decision.findMany({ where: { idea: { workspaceId } }, orderBy: { createdAt: "desc" }, take: 30, include: { idea: { select: { id: true, title: true } } } }),
  ]);

  const sources = new Map<string, Source>();
  for (const o of strategy.objectives) sources.set(`objective:${o.id}`, { type: "objective", id: o.id, label: o.title, href: `/app/strategy#o-${o.id}` });
  for (const p of strategy.products) sources.set(`product:${p.id}`, { type: "product", id: p.id, label: p.name, href: `/app/products#p-${p.id}` });
  for (const i of ideas) sources.set(`idea:${i.id}`, { type: "idea", id: i.id, label: i.title, href: `/app/ideas/${i.id}` });
  for (const i of initiatives) sources.set(`initiative:${i.id}`, { type: "initiative", id: i.id, label: i.title, href: `/app/initiatives/${i.id}` });
  for (const d of decisions) sources.set(`decision:${d.id}`, { type: "decision", id: d.id, label: `${d.outcome.toLowerCase()}: ${d.idea.title}`, href: `/app/ideas/${d.idea.id}` });

  const lines = [strategyText(strategy), "", "Ideas (newest first):"];
  if (ideas.length === 0) lines.push("- (none)");
  for (const i of ideas) {
    const ev = i.evaluations[0];
    lines.push(
      `- [idea:${i.id}] ${i.title} | status ${i.status}${i.product ? ` | product ${i.product.name}` : ""}${i.effort ? ` | effort ${i.effort}` : ""}${ev ? ` | AI said ${ev.recommendation} (impact ${ev.impactScore}, alignment ${ev.alignmentScore})` : ""} | ${i._count.evidence} evidence items${i.rank ? ` | rank ${i.rank}` : ""}`,
    );
  }
  lines.push("", "Initiatives on the roadmap:");
  if (initiatives.length === 0) lines.push("- (none)");
  for (const i of initiatives) {
    const objs = i.objectives.map((o) => `objective:${o.objectiveId}`).join(", ") || "NO OBJECTIVE (unaligned)";
    lines.push(
      `- [initiative:${i.id}] ${i.title} | ${i.horizon} | ${i.status}${i.statusNote ? ` (${i.statusNote})` : ""} | owner ${i.owner?.name ?? "none"} | serves ${objs}${i.endDate ? ` | due ${i.endDate.toISOString().slice(0, 10)}` : ""} | milestones ${i.milestones.filter((m) => m.status === "DONE").length}/${i.milestones.length} done`,
    );
  }
  lines.push("", "Recent decisions:");
  if (decisions.length === 0) lines.push("- (none)");
  for (const d of decisions) lines.push(`- [decision:${d.id}] ${d.outcome} "${d.idea.title}" on ${d.createdAt.toISOString().slice(0, 10)}: ${d.reason}`);

  return { text: lines.join("\n"), sources, strategy, ideas, initiatives };
}

function pickSources(refs: string[], sources: Map<string, Source>): Source[] {
  const out: Source[] = [];
  for (const r of refs) {
    const s = sources.get(r.trim());
    if (s && !out.some((o) => o.type === s.type && o.id === s.id)) out.push(s);
  }
  return out;
}

async function startRun(ctx: Ctx, agent: AgentKind, input?: object) {
  return prisma.agentRun.create({
    data: { workspaceId: ctx.workspace.id, agent, input: input ?? Prisma.JsonNull, strategyVersion: ctx.workspace.strategyVersion, startedById: ctx.user.id },
  });
}

async function finishRun(id: string, model: string) {
  await prisma.agentRun.update({ where: { id }, data: { status: "DONE", model, finishedAt: new Date() } });
}

async function failRun(id: string, err: unknown) {
  const message = err instanceof Error ? err.message : "Failed";
  await prisma.agentRun.update({ where: { id }, data: { status: "FAILED", error: message.slice(0, 500), finishedAt: new Date() } }).catch(() => {});
}

async function withRun<T>(ctx: Ctx, agent: AgentKind, input: object | undefined, fn: (runId: string) => Promise<{ value: T; model: string }>): Promise<T> {
  const run = await startRun(ctx, agent, input);
  try {
    const { value, model } = await fn(run.id);
    await finishRun(run.id, model);
    return value;
  } catch (err) {
    await failRun(run.id, err);
    throw err;
  }
}

// ---------- Prioritisation: evaluate one idea ----------

const evaluationSchema = {
  type: "object",
  properties: {
    ratings: {
      type: "object",
      properties: Object.fromEntries(
        ["alignment", "customerImpact", "businessImpact", "evidence", "effort", "risk"].map((k) => [
          k,
          { type: "object", properties: { level: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }, reason: { type: "string" } }, required: ["level", "reason"] },
        ]),
      ),
      required: ["alignment", "customerImpact", "businessImpact", "evidence", "effort", "risk"],
    },
    impactScore: { type: "integer", description: "0-100: overall value if it works (customer + business impact)." },
    alignmentScore: { type: "integer", description: "0-100: how directly it serves the current objectives." },
    recommendation: { type: "string", enum: ["BUILD_NOW", "EXPLORE", "DEFER", "REJECT"] },
    rationale: { type: "string", description: "2-3 sentences explaining the recommendation, naming the objectives it serves or doesn't." },
    objectiveIds: { type: "array", items: { type: "string" }, description: "Ids (without the 'objective:' prefix) of objectives this idea supports." },
    openQuestions: { type: "array", items: { type: "string" }, description: "Up to 4 questions the team should answer before committing." },
    precedents: { type: "array", items: { type: "string" }, description: "References like 'decision:<id>' or 'idea:<id>' of similar past items, if any." },
  },
  required: ["ratings", "impactScore", "alignmentScore", "recommendation", "rationale", "objectiveIds", "openQuestions", "precedents"],
};

const rating = z.object({ level: LEVEL, reason: z.string() });
const evaluationResult = z.object({
  ratings: z.object({ alignment: rating, customerImpact: rating, businessImpact: rating, evidence: rating, effort: rating, risk: rating }),
  impactScore: z.number().int().min(0).max(100),
  alignmentScore: z.number().int().min(0).max(100),
  recommendation: z.enum(["BUILD_NOW", "EXPLORE", "DEFER", "REJECT"]),
  rationale: z.string().min(1),
  objectiveIds: z.array(z.string()),
  openQuestions: z.array(z.string()),
  precedents: z.array(z.string()),
});
export type EvaluationResult = z.infer<typeof evaluationResult>;

const EVALUATE_INSTRUCTION = `You are the Prioritisation Agent for a product team. Evaluate ONE idea against the team's strategy.
Rate each dimension HIGH, MEDIUM or LOW with a one-line reason that names a specific objective, piece of evidence or constraint.
- alignment: how directly it serves the current company objectives.
- customerImpact / businessImpact: value if it works. Use only the evidence given.
- evidence: strength of the evidence attached (none or anecdotal = LOW, a few quotes = MEDIUM, measured data = HIGH).
- effort: use the team's estimate if given (XS/S = LOW effort, M = MEDIUM, L/XL = HIGH). If there is no estimate, say so and rate MEDIUM.
- risk: delivery, technical or adoption risk.
Recommendation: BUILD_NOW only when alignment and impact are high and evidence is at least MEDIUM. EXPLORE when promising but evidence is thin. DEFER when it doesn't serve the current objectives. REJECT when it conflicts with strategy or has no case.`;

export async function evaluateIdea(ctx: Ctx, ideaId: string) {
  const idea = await prisma.idea.findFirstOrThrow({
    where: { id: ideaId, workspaceId: ctx.workspace.id },
    include: { evidence: true, product: { select: { name: true } } },
  });
  const wc = await workspaceContext(ctx.workspace.id);
  const ideaText = [
    `Idea to evaluate: [idea:${idea.id}] ${idea.title}`,
    idea.description && `Description: ${idea.description}`,
    idea.product && `Product: ${idea.product.name}`,
    idea.source && `Source: ${idea.source}${idea.requester ? ` (${idea.requester})` : ""}`,
    idea.problemWho && `Who has the problem: ${idea.problemWho}`,
    idea.problemWhat && `The problem: ${idea.problemWhat}`,
    idea.problemWhy && `Why now: ${idea.problemWhy}`,
    `Effort estimate from the team: ${idea.effort ?? "none given"}${idea.effortNote ? ` (${idea.effortNote})` : ""}`,
    `Evidence (${idea.evidence.length}):`,
    ...idea.evidence.map((e) => `- ${e.kind}: ${e.content}${e.source ? ` (source: ${e.source})` : ""}`),
  ]
    .filter(Boolean)
    .join("\n");

  const objectiveIds = new Set(wc.strategy.objectives.map((o) => o.id));
  return withRun(ctx, "PRIORITISATION", { ideaId }, async () => {
    const { data, model } = await aiJson({
      instruction: EVALUATE_INSTRUCTION,
      context: `${wc.text}\n\n${ideaText}`,
      schema: evaluationSchema,
      parse: evaluationResult,
      careful: true,
      fake: () => fakeEvaluation(idea.evidence.length, [...objectiveIds]),
    });
    // Guardrails the model can't talk its way past.
    let recommendation: Recommendation = data.recommendation;
    if (recommendation === "BUILD_NOW" && data.ratings.evidence.level === "LOW") recommendation = "EXPLORE";
    const linked = data.objectiveIds.map((s) => s.replace(/^objective:/, "")).filter((id) => objectiveIds.has(id));
    const evaluation = await prisma.$transaction(async (tx) => {
      const ev = await tx.evaluation.create({
        data: {
          ideaId,
          ratings: data.ratings,
          impactScore: data.impactScore,
          alignmentScore: data.alignmentScore,
          recommendation,
          rationale:
            recommendation !== data.recommendation
              ? `${data.rationale} Capped at "Explore further" because the evidence is weak.`
              : data.rationale,
          objectiveIds: linked,
          openQuestions: data.openQuestions.slice(0, 4),
          model,
          strategyVersion: ctx.workspace.strategyVersion,
        },
      });
      await tx.ideaObjective.deleteMany({ where: { ideaId } });
      if (linked.length) await tx.ideaObjective.createMany({ data: linked.map((objectiveId) => ({ ideaId, objectiveId })) });
      if (idea.status === "NEW") await tx.idea.update({ where: { id: ideaId }, data: { status: "EVALUATED" } });
      return ev;
    });
    return { value: { evaluation, precedents: pickSources(data.precedents, wc.sources) }, model };
  });
}

function fakeEvaluation(evidenceCount: number, objectiveIds: string[]): EvaluationResult {
  const strong = evidenceCount >= 2;
  return {
    ratings: {
      alignment: { level: objectiveIds.length ? "HIGH" : "LOW", reason: objectiveIds.length ? "Supports the first company objective." : "No objectives are set yet." },
      customerImpact: { level: "MEDIUM", reason: "Customers raised it, but the size of the group isn't known." },
      businessImpact: { level: "MEDIUM", reason: "Could move the objective's metric; no figures attached." },
      evidence: { level: strong ? "MEDIUM" : "LOW", reason: strong ? `${evidenceCount} evidence items attached.` : "Only anecdotal evidence so far." },
      effort: { level: "MEDIUM", reason: "Based on the team's estimate." },
      risk: { level: "LOW", reason: "Builds on existing flows." },
    },
    impactScore: 68,
    alignmentScore: objectiveIds.length ? 80 : 20,
    recommendation: strong ? "BUILD_NOW" : "EXPLORE",
    rationale: "It serves a current objective and customers have asked for it. Confirm the size of the problem before committing a full squad.",
    objectiveIds: objectiveIds.slice(0, 1),
    openQuestions: ["How many customers hit this each month?", "What does success look like in 6 weeks?"],
    precedents: [],
  };
}

// ---------- Strategy Agent ----------

const strategySchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "2-3 sentences on how well the work covers the strategy." },
    gaps: {
      type: "array",
      items: {
        type: "object",
        properties: { kind: { type: "string", enum: ["objective_without_work", "unaligned_initiative", "other"] }, ref: { type: "string", description: "e.g. objective:<id> or initiative:<id>" }, note: { type: "string" } },
        required: ["kind", "ref", "note"],
      },
    },
    proposals: {
      type: "array",
      description: "Up to 4 new initiatives that would close the biggest gaps.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          objectiveIds: { type: "array", items: { type: "string" } },
          horizon: { type: "string", enum: ["NOW", "NEXT", "LATER"] },
          rationale: { type: "string" },
        },
        required: ["title", "description", "objectiveIds", "horizon", "rationale"],
      },
    },
    realignments: {
      type: "array",
      description: "Existing unaligned initiatives that clearly serve an objective.",
      items: {
        type: "object",
        properties: { initiativeId: { type: "string" }, objectiveIds: { type: "array", items: { type: "string" } }, reason: { type: "string" } },
        required: ["initiativeId", "objectiveIds", "reason"],
      },
    },
  },
  required: ["summary", "gaps", "proposals", "realignments"],
};

const strategyResult = z.object({
  summary: z.string(),
  gaps: z.array(z.object({ kind: z.string(), ref: z.string(), note: z.string() })),
  proposals: z.array(z.object({ title: z.string(), description: z.string(), objectiveIds: z.array(z.string()), horizon: z.enum(["NOW", "NEXT", "LATER"]), rationale: z.string() })),
  realignments: z.array(z.object({ initiativeId: z.string(), objectiveIds: z.array(z.string()), reason: z.string() })),
});
export type StrategyProposal = z.infer<typeof strategyResult>;

export async function runStrategyAgent(ctx: Ctx) {
  const wc = await workspaceContext(ctx.workspace.id);
  if (wc.strategy.objectives.length === 0) throw new AiError("other", "Add at least one company objective first.");
  const objectiveIds = new Set(wc.strategy.objectives.map((o) => o.id));
  const initiativeIds = new Set(wc.initiatives.map((i) => i.id));
  return withRun(ctx, "STRATEGY", undefined, async (runId) => {
    const { data, model } = await aiJson({
      instruction: `You are the Strategy Agent. Compare the company objectives with the initiatives on the roadmap.
Find objectives with no initiatives serving them, initiatives that serve no objective, and anything else that looks out of line.
Propose at most 4 new initiatives that would close the biggest gaps, each tied to objective ids. Only propose realignments that are clearly justified.`,
      context: wc.text,
      schema: strategySchema,
      parse: strategyResult,
      careful: true,
      fake: () => ({
        summary: "One objective has no initiative working towards it.",
        gaps: wc.strategy.objectives.filter((o) => o._count.initiatives === 0).slice(0, 2).map((o) => ({ kind: "objective_without_work", ref: `objective:${o.id}`, note: `Nothing on the roadmap serves "${o.title}".` })),
        proposals: wc.strategy.objectives.filter((o) => o._count.initiatives === 0).slice(0, 1).map((o) => ({ title: `First step towards: ${o.title}`, description: "A small, measurable initiative to start moving this objective.", objectiveIds: [o.id], horizon: "NEXT" as const, rationale: "No current work serves this objective." })),
        realignments: [],
      }),
    });
    const clean = (ids: string[]) => ids.map((s) => s.replace(/^objective:/, "")).filter((id) => objectiveIds.has(id));
    const content: StrategyProposal = {
      summary: data.summary,
      gaps: data.gaps.filter((g) => wc.sources.has(g.ref)),
      proposals: data.proposals.slice(0, 4).map((p) => ({ ...p, objectiveIds: clean(p.objectiveIds) })),
      realignments: data.realignments
        .map((r) => ({ ...r, initiativeId: r.initiativeId.replace(/^initiative:/, ""), objectiveIds: clean(r.objectiveIds) }))
        .filter((r) => initiativeIds.has(r.initiativeId) && r.objectiveIds.length > 0),
    };
    const refs = [...content.gaps.map((g) => g.ref), ...content.proposals.flatMap((p) => p.objectiveIds.map((id) => `objective:${id}`)), ...content.realignments.map((r) => `initiative:${r.initiativeId}`)];
    const draft = await prisma.draft.create({
      data: {
        workspaceId: ctx.workspace.id,
        runId,
        kind: "STRATEGY_PROPOSAL",
        title: `Strategy review: ${content.proposals.length} proposal${content.proposals.length === 1 ? "" : "s"}, ${content.gaps.length} gap${content.gaps.length === 1 ? "" : "s"}`,
        summary: content.summary,
        content,
        sources: pickSources(refs, wc.sources),
      },
    });
    return { value: draft, model };
  });
}

// ---------- Prioritisation Agent: re-rank the backlog ----------

const rankingSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    ranking: {
      type: "array",
      items: { type: "object", properties: { ideaId: { type: "string" }, reason: { type: "string", description: "One line on why it sits here." } }, required: ["ideaId", "reason"] },
      description: "Every open idea, most important first.",
    },
  },
  required: ["summary", "ranking"],
};
const rankingResult = z.object({ summary: z.string(), ranking: z.array(z.object({ ideaId: z.string(), reason: z.string() })) });
export type BacklogRanking = { summary: string; ranking: { ideaId: string; title: string; reason: string }[] };

export async function runPrioritisationAgent(ctx: Ctx) {
  // Evaluate up to 5 ideas nobody has evaluated yet, then rank the whole open backlog.
  const fresh = await prisma.idea.findMany({ where: { workspaceId: ctx.workspace.id, status: "NEW" }, orderBy: { createdAt: "asc" }, take: 5, select: { id: true } });
  for (const i of fresh) await evaluateIdea(ctx, i.id);
  const wc = await workspaceContext(ctx.workspace.id);
  const open = wc.ideas.filter((i) => ["NEW", "EVALUATED", "EXPLORING", "DEFERRED"].includes(i.status));
  if (open.length === 0) throw new AiError("other", "There are no open ideas to rank.");
  const openIds = new Map(open.map((i) => [i.id, i.title]));
  return withRun(ctx, "PRIORITISATION", { rank: true }, async (runId) => {
    const { data, model } = await aiJson({
      instruction: `You are the Prioritisation Agent. Rank every OPEN idea (status NEW, EVALUATED, EXPLORING or DEFERRED) for this team, most important first,
weighing alignment with objectives, impact, evidence strength and effort. Use the evaluations already recorded. Give one line of reasoning per idea.
Open ideas: ${open.map((i) => `idea:${i.id}`).join(", ")}`,
      context: wc.text,
      schema: rankingSchema,
      parse: rankingResult,
      fake: () => ({
        summary: "Ranked by AI recommendation, then impact.",
        ranking: [...open]
          .sort((a, b) => (b.evaluations[0]?.impactScore ?? 0) + (b.evaluations[0]?.alignmentScore ?? 0) - ((a.evaluations[0]?.impactScore ?? 0) + (a.evaluations[0]?.alignmentScore ?? 0)))
          .map((i) => ({ ideaId: i.id, reason: i.evaluations[0] ? `AI recommends ${i.evaluations[0].recommendation.toLowerCase().replace("_", " ")}.` : "Not evaluated yet." })),
      }),
    });
    const seen = new Set<string>();
    const ranking = data.ranking
      .map((r) => ({ ...r, ideaId: r.ideaId.replace(/^idea:/, "") }))
      .filter((r) => openIds.has(r.ideaId) && !seen.has(r.ideaId) && seen.add(r.ideaId))
      .map((r) => ({ ideaId: r.ideaId, title: openIds.get(r.ideaId)!, reason: r.reason }));
    // Anything the model left out goes to the bottom, so nothing silently disappears.
    for (const [id, title] of openIds) if (!seen.has(id)) ranking.push({ ideaId: id, title, reason: "Not ranked by the agent." });
    const content: BacklogRanking = { summary: data.summary, ranking };
    const draft = await prisma.draft.create({
      data: {
        workspaceId: ctx.workspace.id,
        runId,
        kind: "BACKLOG_RANKING",
        title: `Backlog ranking: ${ranking.length} open idea${ranking.length === 1 ? "" : "s"}`,
        summary: data.summary,
        content,
        sources: pickSources(ranking.slice(0, 12).map((r) => `idea:${r.ideaId}`), wc.sources),
      },
    });
    return { value: draft, model };
  });
}

// ---------- PRD Agent ----------

const prdSchema = {
  type: "object",
  properties: {
    summary: { type: "string", description: "One sentence: what this PRD proposes." },
    markdown: {
      type: "string",
      description:
        "The PRD in markdown with these sections: ## Problem, ## Goals and success metrics, ## Users, ## Scope (in / out), ## User stories (each 'As a…, I want…, so that…' with acceptance criteria as a checklist), ## Open questions, ## Risks. Mark anything assumed with (assumption).",
    },
    refs: { type: "array", items: { type: "string" }, description: "References used, like objective:<id>, idea:<id>." },
  },
  required: ["summary", "markdown", "refs"],
};
const prdResult = z.object({ summary: z.string(), markdown: z.string().min(50), refs: z.array(z.string()) });

export async function runPrdAgent(ctx: Ctx, initiativeId: string) {
  const initiative = await prisma.initiative.findFirstOrThrow({
    where: { id: initiativeId, workspaceId: ctx.workspace.id },
    include: {
      objectives: { include: { objective: true } },
      product: true,
      idea: { include: { evidence: true, evaluations: { orderBy: { createdAt: "desc" }, take: 1 } } },
      milestones: true,
    },
  });
  const wc = await workspaceContext(ctx.workspace.id);
  const detail = [
    `Write the PRD for: [initiative:${initiative.id}] ${initiative.title}`,
    initiative.description && `Description: ${initiative.description}`,
    initiative.product && `Product: ${initiative.product.name}${initiative.product.vision ? ` (vision: ${initiative.product.vision})` : ""}`,
    `Serves: ${initiative.objectives.map((o) => `[objective:${o.objectiveId}] ${o.objective.title} (${o.objective.metric ?? "no metric"}, target ${o.objective.target ?? "none"})`).join("; ") || "no objective yet"}`,
    initiative.idea && `Came from idea [idea:${initiative.idea.id}] ${initiative.idea.title}. Problem: ${initiative.idea.problemWhat ?? "not captured"}. Who: ${initiative.idea.problemWho ?? "not captured"}.`,
    initiative.idea?.evidence.length && `Evidence:\n${initiative.idea.evidence.map((e) => `- ${e.kind}: ${e.content}`).join("\n")}`,
    initiative.idea?.evaluations[0] && `Evaluation rationale: ${initiative.idea.evaluations[0].rationale}`,
    initiative.milestones.length && `Milestones: ${initiative.milestones.map((m) => m.title).join("; ")}`,
  ]
    .filter(Boolean)
    .join("\n");
  return withRun(ctx, "PRD", { initiativeId }, async (runId) => {
    const { data, model } = await aiJson({
      instruction: `You are the PRD Agent. Draft a concise, practical PRD a designer and engineers can build from. 3 to 6 user stories, each with 2 to 4 testable acceptance criteria.`,
      context: `${wc.text}\n\n${detail}`,
      schema: prdSchema,
      parse: prdResult,
      careful: true,
      fake: () => ({
        summary: `A first version of ${initiative.title}.`,
        markdown: `## Problem\n${initiative.idea?.problemWhat ?? "Not captured yet (assumption)."}\n\n## Goals and success metrics\n- Move ${initiative.objectives[0]?.objective.title ?? "the linked objective"}\n\n## Users\n${initiative.idea?.problemWho ?? "Existing customers (assumption)"}\n\n## Scope\n**In:** the core flow.\n**Out:** admin tooling.\n\n## User stories\n**As a** customer, **I want** to complete the flow, **so that** I get value faster.\n- [ ] The flow works on mobile\n- [ ] Errors are explained in plain words\n\n## Open questions\n- What is the launch date?\n\n## Risks\n- Adoption`,
        refs: [`initiative:${initiative.id}`, ...initiative.objectives.map((o) => `objective:${o.objectiveId}`)],
      }),
    });
    const draft = await prisma.draft.create({
      data: {
        workspaceId: ctx.workspace.id,
        runId,
        kind: "PRD",
        title: `PRD: ${initiative.title}`,
        summary: data.summary,
        content: { markdown: data.markdown },
        sources: pickSources([`initiative:${initiative.id}`, ...data.refs], wc.sources),
        targetId: initiative.id,
      },
    });
    return { value: draft, model };
  });
}

// ---------- Briefing ----------

const briefingSchema = {
  type: "object",
  properties: {
    title: { type: "string", description: "e.g. 'Week of 16 Nov: payments on track, onboarding at risk'" },
    markdown: {
      type: "string",
      description: "The briefing in markdown: ## Headline (2 sentences), ## Objectives (one line each with progress), ## At risk, ## Decisions made, ## Needs a decision, ## Next week. Be specific: names, numbers, dates.",
    },
    refs: { type: "array", items: { type: "string" } },
  },
  required: ["title", "markdown", "refs"],
};
const briefingResult = z.object({ title: z.string(), markdown: z.string().min(30), refs: z.array(z.string()) });

export async function runBriefing(ctx: Ctx) {
  const wc = await workspaceContext(ctx.workspace.id);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [changes, pendingDrafts, pendingIdeas] = await Promise.all([
    prisma.auditLog.findMany({ where: { workspaceId: ctx.workspace.id, createdAt: { gte: since } }, orderBy: { createdAt: "asc" }, take: 120, include: { user: { select: { name: true } } } }),
    prisma.draft.count({ where: { workspaceId: ctx.workspace.id, status: "PENDING" } }),
    prisma.idea.count({ where: { workspaceId: ctx.workspace.id, status: { in: ["NEW", "EVALUATED"] } } }),
  ]);
  const changeText = changes.map((c) => `- ${c.createdAt.toISOString().slice(0, 10)} ${c.user?.name ?? "Someone"}: ${c.summary}`).join("\n") || "- (no recorded changes)";
  return withRun(ctx, "BRIEFING", undefined, async (runId) => {
    const { data, model } = await aiJson({
      instruction: `You write the weekly leadership briefing for the CPO to share with the CEO. Cover the last 7 days. Lead with what matters. Keep it under 350 words.
Pending agent drafts awaiting approval: ${pendingDrafts}. Ideas awaiting a decision: ${pendingIdeas}.`,
      context: `${wc.text}\n\nChanges in the last 7 days:\n${changeText}`,
      schema: briefingSchema,
      parse: briefingResult,
      fake: () => ({
        title: `Weekly briefing: ${wc.strategy.objectives.length} objectives, ${wc.initiatives.length} initiatives`,
        markdown: `## Headline\nWork is moving on ${wc.initiatives.filter((i) => i.status === "IN_PROGRESS").length} initiatives.\n\n## Objectives\n${wc.strategy.objectives.map((o) => `- ${o.title}: ${objectiveProgress(o)}%`).join("\n") || "- None set"}\n\n## Needs a decision\n- ${pendingIdeas} ideas, ${pendingDrafts} agent drafts`,
        refs: wc.strategy.objectives.map((o) => `objective:${o.id}`),
      }),
    });
    const draft = await prisma.draft.create({
      data: {
        workspaceId: ctx.workspace.id,
        runId,
        kind: "BRIEFING",
        title: data.title,
        summary: "Weekly leadership briefing",
        content: { markdown: data.markdown, periodStart: since.toISOString(), periodEnd: new Date().toISOString() },
        sources: pickSources(data.refs, wc.sources),
      },
    });
    return { value: draft, model };
  });
}

export const newShareToken = () => randomBytes(18).toString("base64url");

// ---------- Copilot ----------

const copilotSchema = {
  type: "object",
  properties: {
    answer: { type: "string", description: "The answer in short markdown. Refer to items by name, not id." },
    refs: { type: "array", items: { type: "string" }, description: "Every item the answer relies on, like objective:<id>, idea:<id>, initiative:<id>, decision:<id>." },
    suggestedAgent: { type: "string", enum: ["NONE", "STRATEGY", "PRIORITISATION", "PRD", "BRIEFING"], description: "An agent that could do the work asked for, if any." },
  },
  required: ["answer", "refs", "suggestedAgent"],
};
const copilotResult = z.object({ answer: z.string().min(1), refs: z.array(z.string()), suggestedAgent: z.enum(["NONE", "STRATEGY", "PRIORITISATION", "PRD", "BRIEFING"]) });

export async function askCopilot(ctx: Ctx, history: { role: string; content: string }[], question: string) {
  const wc = await workspaceContext(ctx.workspace.id);
  const convo = history.slice(-10).map((m) => `${m.role === "user" ? "User" : "Copilot"}: ${m.content}`).join("\n");
  return withRun(ctx, "COPILOT", { question: question.slice(0, 500) }, async () => {
    const { data, model } = await aiJson({
      instruction: `You are Product Copilot for ${ctx.org.name}. Answer the user's question using ONLY the workspace context below. Cite every item you rely on in refs.
If the context doesn't contain the answer, say so plainly. You can't change anything yourself: if the user wants work done, suggest the right agent.
The user is ${ctx.user.name} (${ctx.role.toLowerCase()}).`,
      context: `${wc.text}\n\nConversation so far:\n${convo || "(new conversation)"}\n\nUser's question: ${question}`,
      schema: copilotSchema,
      parse: copilotResult,
      fake: () => ({
        answer: `You have ${wc.strategy.objectives.length} objectives and ${wc.initiatives.length} initiatives. ${wc.initiatives.filter((i) => i.objectives.length === 0).length} initiatives serve no objective.`,
        refs: wc.strategy.objectives.slice(0, 3).map((o) => `objective:${o.id}`),
        suggestedAgent: "STRATEGY" as const,
      }),
    });
    return { value: { answer: data.answer, sources: pickSources(data.refs, wc.sources), suggestedAgent: data.suggestedAgent }, model };
  });
}
