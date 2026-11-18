import type { Grid, ImportKind, ImportPlan, OkrMapping, IdeaMapping } from "./types";
import { parseOkrRows } from "./okr";
import { parseIdeaRows } from "./requests";
import { parseTracker } from "./tracker";

// The one entry point the wizard (for its live counts) and the server (for the stored plan)
// both use, so what people preview is exactly what gets imported.
export type BuildOptions = {
  kind: ImportKind;
  headerRow: number;
  okrMapping?: OkrMapping;
  ideaMapping?: IdeaMapping;
  sectionFrom?: number;
  sectionTo?: number;
  period?: string | null;
  year?: number;
};

export function buildPlan(rows: Grid, o: BuildOptions): ImportPlan {
  if (o.kind === "OKRS") {
    return parseOkrRows(rows, o.headerRow, o.okrMapping ?? {}, { from: o.sectionFrom, to: o.sectionTo, period: o.period ?? null });
  }
  if (o.kind === "IDEAS") return parseIdeaRows(rows, o.headerRow, o.ideaMapping ?? {});
  return parseTracker(rows, o.headerRow, o.year ?? new Date().getUTCFullYear());
}

export function planSummary(plan: ImportPlan): string {
  if (plan.kind === "OKRS") {
    const krs = plan.objectives.reduce((a, ob) => a + ob.keyResults.filter((k) => !k.skip).length, 0);
    return `${plan.objectives.length} objective${plan.objectives.length === 1 ? "" : "s"}, ${krs} key result${krs === 1 ? "" : "s"}`;
  }
  if (plan.kind === "IDEAS") return `${plan.ideas.length} request${plan.ideas.length === 1 ? "" : "s"}`;
  const pts = plan.series.reduce((a, s) => a + s.points.length, 0);
  return `${plan.series.length} metric${plan.series.length === 1 ? "" : "s"}, ${pts} weekly reading${pts === 1 ? "" : "s"}`;
}
