import type { Grid, ImportKind, OkrField, OkrMapping, IdeaField, IdeaMapping } from "./types";
import { norm, line } from "./values";

// Working out what a sheet is and which column holds what, from the header row.

type Rule<F extends string> = { field: F; patterns: RegExp[] };

// Earlier rules and earlier patterns win, so put the specific wordings first.
const OKR_RULES: Rule<OkrField>[] = [
  { field: "progress", patterns: [/^% ?grade$/, /^% ?(complete|achieved|progress|done)/, /^progress ?%/, /^score$/] },
  { field: "keyResult", patterns: [/key results?/, /as measured by/, /^krs?\b/, /^metric \/ kr/] },
  { field: "objective", patterns: [/objective/, /we will/, /^goals?$/] },
  { field: "plan", patterns: [/initiatives?/, /^plan/, /actions?$/, /^how/, /^projects?$/] },
  { field: "deliverable", patterns: [/deliverables?/, /definition of done/, /^outputs?$/] },
  { field: "status", patterns: [/^status/, /^state$/, /^rag/] },
  { field: "baseline", patterns: [/starting/, /^start/, /baseline/, /^from$/, /initial/] },
  { field: "target", patterns: [/^target/, /target metric/, /^goal value/, /^to$/] },
  { field: "current", patterns: [/^grade$/, /^current/, /^actual/, /achieved$/, /^latest/, /^now$/, /^value$/] },
  { field: "lead", patterns: [/^lead/, /owner/, /^dri$/, /responsible/, /assignee/] },
  { field: "due", patterns: [/^due/, /deadline/, /end date/, /^date$/] },
  { field: "comment", patterns: [/comments?/, /^notes?/, /^update/, /remarks?/] },
  { field: "metric", patterns: [/metric to track/, /^kpis?$/, /^metric$/] },
];

const IDEA_RULES: Rule<IdeaField>[] = [
  { field: "id", patterns: [/request id/, /^id$/, /^ticket/, /^ref/, /^#$/, /^no$/] },
  { field: "type", patterns: [/request type/, /^type$/, /issue type/, /^kind$/] },
  { field: "category", patterns: [/product category/, /^product/, /^category/, /^area$/, /^module/, /^feature$/, /^platform/] },
  { field: "description", patterns: [/description/, /^details?/, /complaint/, /feedback/] },
  { field: "title", patterns: [/^title/, /^summary/, /^subject/, /^request$/, /^idea$/] },
  { field: "requester", patterns: [/requested by/, /requester/, /reported by/, /submitted by/, /^from$/, /^customer/] },
  { field: "priority", patterns: [/priority/, /severity/, /urgency/] },
  { field: "status", patterns: [/^status/, /^state$/] },
  { field: "date", patterns: [/date submitted/, /^created/, /^submitted/, /reported on/, /^date$/] },
  { field: "resolution", patterns: [/resolution/, /improvement action/, /^fix/] },
  { field: "assignee", patterns: [/assigned to/, /assignee/, /^owner/] },
  { field: "due", patterns: [/target date/, /^due/, /deadline/] },
];

function mapRow<F extends string>(row: Grid[number], rules: Rule<F>[]) {
  const mapping: Partial<Record<F, number>> = {};
  const used = new Set<number>();
  const headers = row.map(norm);
  for (const rule of rules) {
    for (const p of rule.patterns) {
      const col = headers.findIndex((h, i) => h && !used.has(i) && p.test(h));
      if (col >= 0) {
        mapping[rule.field] = col;
        used.add(col);
        break;
      }
    }
  }
  return mapping;
}

function bestHeader<F extends string>(grid: Grid, rules: Rule<F>[], required: F[]) {
  let best = { row: -1, score: 0, mapping: {} as Partial<Record<F, number>> };
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const mapping = mapRow(grid[r], rules);
    if (!required.every((f) => mapping[f] !== undefined)) continue;
    const score = Object.keys(mapping).length;
    if (score > best.score) best = { row: r, score, mapping };
  }
  return best;
}

export function detectOkr(grid: Grid): { headerRow: number; mapping: OkrMapping; score: number } {
  const b = bestHeader(grid, OKR_RULES, ["objective", "keyResult"]);
  return { headerRow: b.row, mapping: b.mapping, score: b.score };
}

export function detectIdeas(grid: Grid): { headerRow: number; mapping: IdeaMapping; score: number } {
  let b = bestHeader(grid, IDEA_RULES, ["description"]);
  if (b.row < 0) b = bestHeader(grid, IDEA_RULES, ["title"]);
  // A log with only a description column uses it as the title too.
  if (b.row >= 0 && b.mapping.title === undefined && b.mapping.description !== undefined) b.mapping = { ...b.mapping };
  return { headerRow: b.row, mapping: b.mapping, score: b.score };
}

const WEEK = /^(w|wk|week)\s*\d{1,2}\b/i;

export function detectTracker(grid: Grid): { labelRow: number; score: number } {
  for (let r = 0; r < Math.min(grid.length, 20); r++) {
    const weeks = grid[r].filter((c) => WEEK.test(line(c))).length;
    if (weeks >= 2) return { labelRow: r, score: weeks };
  }
  return { labelRow: -1, score: 0 };
}

// What a sheet most likely is, so the wizard can pre-select it.
export function guessKind(name: string, grid: Grid): { kind: ImportKind | null; confidence: number } {
  const okr = detectOkr(grid);
  const ideas = detectIdeas(grid);
  const tracker = detectTracker(grid);
  const n = name.toLowerCase();
  const scores: [ImportKind, number][] = [
    ["OKRS", okr.headerRow >= 0 ? okr.score + (/okr/.test(n) ? 3 : 0) - (/tracker/.test(n) ? 2 : 0) : 0],
    ["IDEAS", ideas.headerRow >= 0 && ideas.mapping.status !== undefined ? ideas.score + (/request|complaint|feedback|bug|issue|portal/.test(n) ? 3 : 0) : 0],
    ["METRICS", tracker.labelRow >= 0 ? 4 + Math.min(tracker.score, 6) + (/tracker|metric|kpi/.test(n) ? 3 : 0) : 0],
  ];
  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][1] >= 4 ? { kind: scores[0][0], confidence: scores[0][1] } : { kind: null, confidence: 0 };
}
