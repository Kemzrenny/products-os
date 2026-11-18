import type { Cell, WorkState } from "./types";

// Reading the values people actually type into spreadsheets.

export function text(c: Cell | undefined): string {
  if (c === null || c === undefined) return "";
  return String(c).replace(/\r\n/g, "\n").trim();
}

// One-line version for titles: collapses line breaks and repeated spaces.
export function line(c: Cell | undefined): string {
  return text(c).replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
}

const BLANKS = new Set(["", "-", "—", "–", "n/a", "na", "#n/a", "#value!", "#div/0!", "#ref!", "none", "null", "tbd", "tbc", "?"]);

// "25%", "6,776", "₦2,000", "0.25", "≥80%", "~17%" → a number, or null. Percent signs are
// reported so the caller can decide on the scale.
export function num(c: Cell | undefined): { value: number; percent: boolean } | null {
  if (typeof c === "number") return Number.isFinite(c) ? { value: c, percent: false } : null;
  const s = text(c).toLowerCase();
  if (BLANKS.has(s)) return null;
  const m = /^[^\d-]{0,4}(-?\d[\d,]*(?:\.\d+)?)(%|k\b|m\b)?/.exec(s.replace(/\s+/g, ""));
  if (!m) return null;
  let v = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(v)) return null;
  if (m[2] === "k") v *= 1000;
  if (m[2] === "m") v *= 1_000_000;
  return { value: v, percent: m[2] === "%" };
}

export function round(v: number, dp = 2) {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
}

// A key result is about a percentage when its wording says so. Spreadsheets usually store
// those as fractions (0.25 for 25%); Products OS stores 25 with the unit "%".
export function looksPercent(title: string, values: (number | null)[], anyPercentSign: boolean): boolean {
  if (anyPercentSign) return true;
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return false;
  const fractional = nums.every((v) => v >= 0 && v <= 1.5);
  return fractional && /%|percent|rate\b|ratio/i.test(title);
}

export function status(c: Cell | undefined): WorkState | null {
  const s = line(c).toLowerCase();
  if (!s) return null;
  if (/blocked|stuck|on hold/.test(s)) return "BLOCKED";
  if (/risk|delay|behind|slipp|late/.test(s)) return "AT_RISK";
  if (/done|complete|achieved|shipped|live|launched|closed|resolved/.test(s)) return "DONE";
  if (/ongoing|progress|started|doing|active|dev|build|testing|review/.test(s)) return "IN_PROGRESS";
  if (/pending|planned|not started|to ?do|backlog|new|open|later/.test(s)) return "NOT_STARTED";
  return null;
}

// "Morenike\nOluchi", "Tolu/Jake", "Jake, Samson & Dayo" → ["Morenike", "Oluchi", …]
export function names(c: Cell | undefined): string[] {
  return text(c)
    .split(/[\n,/&;+]|\band\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 40 && !/^(all|team|tbd|n\/a)$/i.test(s));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

// ISO strings from the reader, "31/12/2026", "Dec 31, 2026", "2026-12-31" → "2026-12-31".
export function date(c: Cell | undefined): string | null {
  const s = text(c);
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    // Day first, as written in Nigeria and the UK.
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})$/i.exec(s);
  if (m && MONTHS.includes(m[1].toLowerCase())) return `${m[3]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/i.exec(s);
  if (m && MONTHS.includes(m[2].toLowerCase())) return `${m[3]}-${String(MONTHS.indexOf(m[2].toLowerCase()) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

export function monthIndex(word: string): number {
  return MONTHS.indexOf(word.slice(0, 3).toLowerCase());
}

// "Q4", "Q4 2026", "Quarter 4 2026", "Q2 OKR Tracker | Apr 6 – Jun 30, 2026" → { q: 4, year: 2026 }
export function quarterOf(c: Cell | undefined): { q: number; year: number | null } | null {
  const s = line(c);
  const m = /\b(?:q|quarter\s*)([1-4])\b(?:[^\d]{0,30}(20\d{2}))?/i.exec(s);
  if (!m) return null;
  return { q: Number(m[1]), year: m[2] ? Number(m[2]) : null };
}

export function quarterRange(q: number, year: number) {
  const start = new Date(Date.UTC(year, (q - 1) * 3, 1));
  const end = new Date(Date.UTC(year, q * 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// Plain words for matching column headers.
export function norm(c: Cell | undefined) {
  return line(c)
    .toLowerCase()
    .replace(/[^a-z0-9%#]+/g, " ")
    .trim();
}

// Rough similarity between two titles (0–1), for matching tracker rows to key results.
export function similarity(a: string, b: string): number {
  const words = (s: string) => new Set(norm(s).split(" ").filter((w) => w.length > 2 && !STOP.has(w)));
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / Math.min(A.size, B.size);
}
const STOP = new Set(["the", "and", "for", "with", "least", "from", "into", "that", "this", "users", "user", "within", "achieve", "increase", "reduce", "keep"]);
