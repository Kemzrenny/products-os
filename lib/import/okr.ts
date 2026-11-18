import type { Grid, OkrMapping, OkrPlan, PlannedKr, PlannedObjective } from "./types";
import { text, line, num, round, looksPercent, status, names, date, quarterOf } from "./values";

export type Section = { label: string; row: number; q: number; year: number | null };

// Quarter rows ("Q1", "Q4 2026") split an OKR sheet into periods.
export function okrSections(grid: Grid, headerRow: number, mapping: OkrMapping): Section[] {
  const out: Section[] = [];
  const objCol = mapping.objective ?? 1;
  const krCol = mapping.keyResult ?? 2;
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    if (line(row[krCol])) continue;
    for (let c = 0; c <= Math.max(objCol, 1); c++) {
      const v = line(row[c]);
      if (!v || v.length > 20) continue;
      const q = quarterOf(v);
      if (q) {
        out.push({ label: v, row: r, q: q.q, year: q.year });
        break;
      }
    }
  }
  return out;
}

const LOWER_IS_BETTER = /reduce|≤|<=|below|under|\bcut\b|drop-?off|churn|lower|decrease|fewer|less than|time to/i;

export function parseOkrRows(
  grid: Grid,
  headerRow: number,
  mapping: OkrMapping,
  opts: { from?: number; to?: number; period: string | null },
): OkrPlan {
  const start = (opts.from ?? headerRow) + 1;
  const end = Math.min(opts.to ?? grid.length, grid.length);
  const get = (row: Grid[number], f: keyof OkrMapping) => (mapping[f] === undefined ? null : (row[mapping[f]!] ?? null));
  const objectives: PlannedObjective[] = [];
  let current = null as PlannedObjective | null;

  for (let r = start; r < end; r++) {
    const row = grid[r] ?? [];
    const objTitle = line(get(row, "objective"));
    const krTitle = line(get(row, "keyResult"));
    if (objTitle && objTitle !== current?.title) {
      current = { title: objTitle, keyResults: [], sourceRow: r + 1 };
      objectives.push(current);
    }
    if (!krTitle) continue;
    if (!current) {
      current = { title: "Untitled objective", keyResults: [], sourceRow: r + 1 };
      objectives.push(current);
    }

    const b = num(get(row, "baseline"));
    const t = num(get(row, "target"));
    let c = num(get(row, "current"));
    const p = num(get(row, "progress"));
    const warnings: string[] = [];
    // No current value but a progress score: work the value out from it.
    if (!c && p && b && t && t.value !== b.value) {
      const frac = p.percent ? p.value / 100 : p.value;
      c = { value: b.value + frac * (t.value - b.value), percent: b.percent || t.percent };
    }
    const pct = looksPercent(krTitle, [b?.value ?? null, t?.value ?? null, c?.value ?? null], !!(b?.percent || t?.percent || c?.percent));
    const scale = (v: { value: number; percent: boolean } | null) => (v === null ? null : round(pct && !v.percent && Math.abs(v.value) <= 1.5 ? v.value * 100 : v.value, 2));
    const baseline = scale(b);
    const target = scale(t);
    const cur = scale(c);
    const unit = pct ? "%" : null;

    if (target === null) warnings.push("No target number, so progress can't be measured until you add one.");
    if (target !== null && cur === null) warnings.push("No current value yet. It will start at the baseline.");
    if (target !== null && cur !== null && baseline !== null && target > baseline && cur > target * 1.5) {
      warnings.push(`The current value (${cur}${unit ?? ""}) is well past the target (${target}${unit ?? ""}). Check it isn't a progress score.`);
    }
    if (target !== null && baseline !== null && target > baseline && LOWER_IS_BETTER.test(krTitle)) {
      warnings.push("This reads like lower is better. Set the baseline to the starting value so progress counts the right way.");
    }

    // A long sentence with no numbers at all is a note ("Priorities for the remaining six weeks"), not a KR.
    const krStatus = status(get(row, "status"));
    const leads = names(get(row, "lead"));
    const skip = baseline === null && target === null && cur === null && ((!krStatus && leads.length === 0) || krTitle.length > 140);
    if (skip) warnings.splice(0, warnings.length, "Looks like a note rather than a key result, so it's left out. Tick it to bring it in.");
    current.keyResults.push({
      title: krTitle.slice(0, 400),
      baseline,
      target,
      current: cur,
      unit,
      status: krStatus,
      leads,
      due: date(get(row, "due")),
      comment: text(get(row, "comment")).slice(0, 3000) || null,
      plan: text(get(row, "plan")).slice(0, 3000) || null,
      deliverable: line(get(row, "deliverable")).slice(0, 300) || null,
      warnings,
      skip,
      sourceRow: r + 1,
    });
  }

  return { kind: "OKRS", period: opts.period, objectives: objectives.filter((o) => o.keyResults.length > 0) };
}

// A short initiative name from a key result's plan: its first step, up to a colon.
export function initiativeTitle(kr: Pick<PlannedKr, "plan" | "deliverable" | "title">): string {
  const first = (kr.plan ?? "")
    .split("\n")
    .map((s) => s.replace(/^\s*(?:[-•*]|\d+[.)]|phase\s*\d+\s*:)\s*/i, "").trim())
    .find((s) => s.length > 3);
  let t = first ?? kr.deliverable ?? kr.title;
  const colon = t.indexOf(":");
  if (colon >= 12 && colon <= 90) t = t.slice(0, colon);
  t = t.replace(/[.;]\s*$/, "");
  if (t.length > 90) t = `${t.slice(0, 87).replace(/\s+\S*$/, "")}…`;
  return t.charAt(0).toUpperCase() + t.slice(1);
}
