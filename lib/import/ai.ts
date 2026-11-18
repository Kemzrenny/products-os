import "server-only";
import { z } from "zod";
import { aiJson } from "@/lib/gemini";
import type { OkrPlan } from "./types";
import { looksPercent, round } from "./values";

// "Paste anything": a Notion page, a slide's text or a messy sheet, read by the Strategy
// Agent into the same plan a spreadsheet produces. The person still reviews it before
// anything is created.

const schema = {
  type: "object",
  properties: {
    period: { type: "string", description: "The quarter or period these OKRs are for, e.g. 'Q4 2026'. Empty if not stated." },
    objectives: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          keyResults: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "The key result as written." },
                baseline: { type: "number", description: "Starting value. Omit if not stated." },
                current: { type: "number", description: "Latest value or progress so far. Omit if not stated." },
                target: { type: "number", description: "Target value. Omit if not stated." },
                unit: { type: "string", description: "'%' for percentages (write 25 for 25%), otherwise empty." },
                status: { type: "string", enum: ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "BLOCKED", "DONE", ""] },
                leads: { type: "array", items: { type: "string" } },
                due: { type: "string", description: "YYYY-MM-DD if stated, otherwise empty." },
                comment: { type: "string", description: "Any progress update written next to it." },
                plan: { type: "string", description: "Initiatives or actions listed for it." },
              },
              required: ["title"],
            },
          },
        },
        required: ["title", "keyResults"],
      },
    },
  },
  required: ["objectives"],
};

const parse = z.object({
  period: z.string().optional(),
  objectives: z.array(
    z.object({
      title: z.string(),
      keyResults: z.array(
        z.object({
          title: z.string(),
          baseline: z.number().optional(),
          current: z.number().optional(),
          target: z.number().optional(),
          unit: z.string().optional(),
          status: z.string().optional(),
          leads: z.array(z.string()).optional(),
          due: z.string().optional(),
          comment: z.string().optional(),
          plan: z.string().optional(),
        }),
      ),
    }),
  ),
});

// Without a key (AI_FAKE): unindented lines are objectives, "- " lines are key results,
// and "x of y" or "from a to b" numbers are read where they appear.
function fakeParse(input: string): z.infer<typeof parse> {
  const objectives: z.infer<typeof parse>["objectives"] = [];
  for (const raw of input.split("\n")) {
    if (!raw.trim()) continue;
    if (/^\s*[-*•]/.test(raw) && objectives.length) {
      const t = raw.replace(/^\s*[-*•]\s*/, "").trim();
      const of = /(\d[\d.,]*)\s*(%?)\s*(?:of|\/)\s*(\d[\d.,]*)/i.exec(t);
      const from = /from\s*(\d[\d.,]*)\s*%?\s*to\s*(\d[\d.,]*)/i.exec(t);
      const n = (s?: string) => (s ? Number(s.replace(/,/g, "")) : undefined);
      objectives.at(-1)!.keyResults.push({
        title: t,
        current: of ? n(of[1]) : undefined,
        target: of ? n(of[3]) : from ? n(from[2]) : undefined,
        baseline: from ? n(from[1]) : undefined,
        unit: /%/.test(t) ? "%" : undefined,
      });
    } else objectives.push({ title: raw.trim(), keyResults: [] });
  }
  return { objectives: objectives.filter((o) => o.keyResults.length) };
}

export async function okrPlanFromText(input: string, period: string | null): Promise<OkrPlan> {
  const { data } = await aiJson({
    instruction: `Extract the OKRs from the text below: objectives, their key results, and every number, status, owner, date, progress note and initiative given for each key result.
Copy wording as written. Never invent numbers: leave a field out when the text doesn't state it. Percentages are written as whole numbers (25 for 25%) with unit '%'.`,
    context: input.slice(0, 60_000),
    schema,
    parse,
    careful: true,
    fake: () => fakeParse(input),
  });
  const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "BLOCKED", "DONE"] as const;
  return {
    kind: "OKRS",
    period: period || data.period?.trim() || null,
    objectives: data.objectives
      .filter((o) => o.keyResults.length)
      .map((o, oi) => ({
        title: o.title.trim().slice(0, 300),
        sourceRow: oi + 1,
        keyResults: o.keyResults.map((k, ki) => {
          const pct = k.unit === "%" || looksPercent(k.title, [k.baseline ?? null, k.target ?? null, k.current ?? null], false);
          const warnings: string[] = [];
          if (k.target === undefined) warnings.push("No target number, so progress can't be measured until you add one.");
          return {
            title: k.title.trim().slice(0, 400),
            baseline: k.baseline === undefined ? null : round(k.baseline, 2),
            current: k.current === undefined ? null : round(k.current, 2),
            target: k.target === undefined ? null : round(k.target, 2),
            unit: pct ? "%" : null,
            status: (STATUSES as readonly string[]).includes(k.status ?? "") ? (k.status as (typeof STATUSES)[number]) : null,
            leads: k.leads ?? [],
            due: /^\d{4}-\d{2}-\d{2}$/.test(k.due ?? "") ? k.due! : null,
            comment: k.comment?.trim() || null,
            plan: k.plan?.trim() || null,
            deliverable: null,
            warnings,
            skip: false,
            sourceRow: ki + 1,
          };
        }),
      })),
  };
}
