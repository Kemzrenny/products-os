import type { Grid, MetricsPlan, PlannedSeries } from "./types";
import { line, norm, num, round, monthIndex } from "./values";

// Weekly or monthly trackers: a metric per row, a column (or Target/Actual/% trio) per week.
// Each week's actual becomes a dated check-in, so the trend survives the import.

const WEEK = /^(?:w|wk|week)\s*(\d{1,2})\b/i;

// "W1 — Apr 6–12", "Week 4 (Oct 28–Nov 3)", "W4 | Apr 28–May 4 | Target" → the week's last day.
export function weekEnd(label: string, year: number): string | null {
  const words = [...label.matchAll(/[a-z]{3,9}/gi)].filter((m) => monthIndex(m[0]) >= 0 && /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(m[0]));
  const last = words.at(-1);
  if (!last || last.index === undefined) return null;
  const days = [...label.slice(last.index).matchAll(/\d{1,2}/g)].map((m) => Number(m[0]));
  const day = days.at(-1);
  if (!day) return null;
  const d = new Date(Date.UTC(year, monthIndex(last[0]), day));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function parseTracker(grid: Grid, labelRow: number, year: number): MetricsPlan {
  const labels = grid[labelRow] ?? [];
  const sub = grid[labelRow + 1] ?? [];
  const subIsKinds = sub.some((c) => /^(actual|target|%)$/i.test(line(c)));

  // Describe every column: which week it belongs to and whether it holds the actual value.
  const width = Math.max(labels.length, sub.length);
  type Col = { week: string; actual: boolean };
  const cols: (Col | null)[] = [];
  let week = "";
  for (let c = 0; c < width; c++) {
    const l = line(labels[c]);
    if (l) week = WEEK.test(l) ? l : "";
    if (!week) {
      cols.push(null);
      continue;
    }
    // "W1 | Actual" style: kind written in the label itself.
    const inLabel = /\b(actual|target|%)\s*$/i.exec(l);
    const kind = subIsKinds ? line(sub[c]).toLowerCase() : inLabel ? inLabel[1].toLowerCase() : "actual";
    cols.push({ week, actual: kind === "actual" });
  }

  // Label column: the first column whose data rows hold text. Unit and target columns by header.
  const findHeader = (re: RegExp) => {
    for (const row of [labels, sub, grid[labelRow - 1] ?? []]) {
      const i = row.findIndex((c) => re.test(norm(c)));
      if (i >= 0 && !cols[i]) return i;
    }
    return -1;
  };
  const unitCol = findHeader(/^unit$/);
  const targetCol = findHeader(/(target|goal)$/);
  const dataStart = labelRow + (subIsKinds ? 2 : 1);
  let nameCol = 0;
  for (let c = 0; c < 4; c++) {
    const texts = grid.slice(dataStart, dataStart + 15).filter((r) => typeof r[c] === "string" && line(r[c]).length > 3).length;
    if (texts >= 3) {
      nameCol = c;
      break;
    }
  }

  const title = line(grid[0]?.find((c) => line(c)) ?? null) || null;
  const series: PlannedSeries[] = [];
  let group: string | null = null;
  for (let r = dataStart; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const name = line(row[nameCol]).replace(/^[★☆*\s]+/, "").trim();
    if (!name) continue;
    const points: PlannedSeries["points"] = [];
    cols.forEach((col, c) => {
      if (!col?.actual) return;
      const v = num(row[c]);
      const d = weekEnd(col.week, year);
      if (v && d && !points.some((p) => p.date === d)) points.push({ date: d, value: v.value, label: col.week });
    });
    const hasNumbers = row.some((c, i) => i !== nameCol && num(c));
    if (!hasNumbers) {
      group = name.slice(0, 120);
      continue;
    }
    let unit = unitCol >= 0 ? line(row[unitCol]) || null : null;
    if (!unit && /%/.test(name)) unit = "%";
    const t = targetCol >= 0 ? num(row[targetCol]) : null;
    // Percentages kept as fractions (0.25) become 25, as everywhere else in Products OS.
    const pct = unit === "%" && [t?.value, ...points.map((p) => p.value)].every((v) => v === undefined || Math.abs(v) <= 1.5);
    const scale = (v: number) => round(pct ? v * 100 : v, 2);
    series.push({ name: name.slice(0, 200), unit, target: t ? scale(t.value) : null, points: points.map((p) => ({ ...p, value: scale(p.value) })), group, sourceRow: r + 1 });
  }
  return { kind: "METRICS", title, series: series.filter((s) => s.points.length > 0 || s.target !== null) };
}
