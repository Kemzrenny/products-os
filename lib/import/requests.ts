import type { Grid, IdeaMapping, IdeaPlan, PlannedIdea } from "./types";
import { text, line, date } from "./values";

// Request, complaint and feedback logs become ideas. Statuses map onto decisions that were
// already made; nothing gets re-judged by the AI.
function mapStatus(raw: string): Pick<PlannedIdea, "status" | "resolved"> {
  const s = raw.toLowerCase();
  if (/resolved|done|fixed|closed|complete|shipped|released/.test(s)) return { status: "APPROVED", resolved: true };
  if (/progress|ongoing|assigned|doing|dev|testing|approved|accepted|planned|scheduled/.test(s)) return { status: "APPROVED", resolved: false };
  if (/reject|won'?t|declin|invalid|duplicate|not a bug/.test(s)) return { status: "REJECTED", resolved: false };
  if (/defer|later|on hold|parked|backlog/.test(s)) return { status: "DEFERRED", resolved: false };
  if (/review|investigat|triage|explor/.test(s)) return { status: "EXPLORING", resolved: false };
  return { status: "NEW", resolved: false };
}

// A title from a long description: its first sentence or line, trimmed.
export function titleFrom(description: string): string {
  const cleaned = description
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s && !/^(feature request summary|summary|description)\s*:?$/i.test(s));
  let t = cleaned[0] ?? description;
  // "Create three forms:" says little on its own; add the first item it introduces.
  if (/:\s*$/.test(t) && cleaned[1]) t = `${t.replace(/:\s*$/, ":")} ${cleaned[1].replace(/^\d+[.)]\s*/, "")}`;
  const stop = t.search(/[.!?](\s|$)/);
  if (stop > 15) t = t.slice(0, stop);
  t = t.replace(/^(summary|request|issue|bug)\s*:\s*/i, "");
  if (t.length > 100) t = `${t.slice(0, 97).replace(/\s+\S*$/, "")}…`;
  return t;
}

export function parseIdeaRows(grid: Grid, headerRow: number, mapping: IdeaMapping): IdeaPlan {
  const get = (row: Grid[number], f: keyof IdeaMapping) => (mapping[f] === undefined ? null : (row[mapping[f]!] ?? null));
  const ideas: PlannedIdea[] = [];
  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const description = text(get(row, "description"));
    const titleCell = line(get(row, "title"));
    if (!description && !titleCell) continue;
    const rawStatus = line(get(row, "status")) || null;
    ideas.push({
      externalId: line(get(row, "id")) || null,
      title: titleCell || titleFrom(description),
      description: description && description !== titleCell ? description.slice(0, 5000) : null,
      type: line(get(row, "type")) || null,
      category: line(get(row, "category")) || null,
      requester: line(get(row, "requester")) || null,
      priority: line(get(row, "priority")) || null,
      ...mapStatus(rawStatus ?? ""),
      rawStatus,
      date: date(get(row, "date")),
      resolution: text(get(row, "resolution")).slice(0, 2000) || null,
      sourceRow: r + 1,
    });
  }
  return { kind: "IDEAS", ideas };
}
