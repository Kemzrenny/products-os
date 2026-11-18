// Shared by the browser (reading the file) and the server (building and applying the import).
// Nothing here touches the database.

export type Cell = string | number | null;
export type Grid = Cell[][];

export type SheetGrid = { name: string; rows: Grid; totalRows: number };

export type ImportKind = "OKRS" | "IDEAS" | "METRICS";

export type WorkState = "NOT_STARTED" | "IN_PROGRESS" | "AT_RISK" | "BLOCKED" | "DONE";

// ---------- OKRs ----------

export const OKR_FIELDS = ["objective", "keyResult", "plan", "deliverable", "status", "baseline", "target", "current", "progress", "lead", "due", "comment", "metric"] as const;
export type OkrField = (typeof OKR_FIELDS)[number];
export type OkrMapping = Partial<Record<OkrField, number>>;

export type PlannedKr = {
  title: string;
  baseline: number | null;
  target: number | null;
  current: number | null;
  unit: string | null;
  status: WorkState | null;
  leads: string[];
  due: string | null; // YYYY-MM-DD
  comment: string | null;
  plan: string | null;
  deliverable: string | null;
  warnings: string[];
  skip: boolean; // suggested: leave it out (looks like a note, not a key result)
  sourceRow: number; // 1-based, for "row 58 in your sheet"
};

export type PlannedObjective = { title: string; keyResults: PlannedKr[]; sourceRow: number };

export type OkrPlan = {
  kind: "OKRS";
  period: string | null; // "Q4 2026"
  objectives: PlannedObjective[];
};

// ---------- Ideas (request / complaint logs) ----------

export const IDEA_FIELDS = ["id", "title", "description", "type", "category", "requester", "priority", "status", "date", "resolution", "assignee", "due"] as const;
export type IdeaField = (typeof IDEA_FIELDS)[number];
export type IdeaMapping = Partial<Record<IdeaField, number>>;

export type PlannedIdea = {
  externalId: string | null;
  title: string;
  description: string | null;
  type: string | null;
  category: string | null;
  requester: string | null;
  priority: string | null;
  status: "NEW" | "APPROVED" | "EXPLORING" | "DEFERRED" | "REJECTED";
  rawStatus: string | null;
  resolved: boolean;
  date: string | null;
  resolution: string | null;
  sourceRow: number;
};

export type IdeaPlan = { kind: "IDEAS"; ideas: PlannedIdea[] };

// ---------- Weekly / monthly metric trackers ----------

export type SeriesPoint = { date: string; value: number; label: string };
export type PlannedSeries = { name: string; unit: string | null; target: number | null; points: SeriesPoint[]; group: string | null; sourceRow: number };
export type MetricsPlan = { kind: "METRICS"; title: string | null; series: PlannedSeries[] };

export type ImportPlan = OkrPlan | IdeaPlan | MetricsPlan;
