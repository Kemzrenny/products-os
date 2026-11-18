"use client";

import { useMemo, useState, useTransition } from "react";
import { FileSpreadsheet, Upload, ClipboardPaste, Check, AlertTriangle, Target, Lightbulb, LineChart } from "lucide-react";
import { createImport, createImportFromText } from "@/app/actions/import";
import { ActionForm } from "@/components/forms";
import { workbookToGrids, csvToGrid } from "@/lib/import/workbook";
import { guessKind, detectOkr, detectIdeas, detectTracker } from "@/lib/import/detect";
import { okrSections, type Section } from "@/lib/import/okr";
import { buildPlan } from "@/lib/import/build";
import { line } from "@/lib/import/values";
import type { SheetGrid, ImportKind, OkrMapping, IdeaMapping, OkrField, IdeaField } from "@/lib/import/types";

const KIND_LABEL: Record<ImportKind, { label: string; help: string; icon: typeof Target }> = {
  OKRS: { label: "OKRs", help: "Objectives and key results, with starting, current and target values", icon: Target },
  IDEAS: { label: "Requests & feedback", help: "A request, complaint or feature log. Each row becomes an idea", icon: Lightbulb },
  METRICS: { label: "Weekly tracker", help: "A metric per row, a column per week. Each week becomes a progress reading", icon: LineChart },
};

const OKR_FIELD_LABEL: Record<OkrField, string> = {
  objective: "Objective",
  keyResult: "Key result",
  plan: "Initiatives / plan",
  deliverable: "Deliverable",
  status: "Status",
  baseline: "Starting value",
  target: "Target value",
  current: "Current value",
  progress: "% progress (used if there's no current value)",
  lead: "Lead / owner",
  due: "Due date",
  comment: "Comments / update",
  metric: "Metric to track",
};

const IDEA_FIELD_LABEL: Record<IdeaField, string> = {
  id: "Request ID",
  title: "Title",
  description: "Description",
  type: "Request type",
  category: "Product / category",
  requester: "Requested by",
  priority: "Priority",
  status: "Status",
  date: "Date submitted",
  resolution: "Resolution",
  assignee: "Assigned to",
  due: "Target date",
};

const today = () => new Date().toISOString().slice(0, 10);
const colName = (i: number) => (i < 26 ? String.fromCharCode(65 + i) : `${String.fromCharCode(64 + Math.floor(i / 26))}${String.fromCharCode(65 + (i % 26))}`);

type Config = {
  kind: ImportKind;
  headerRow: number;
  okrMapping: OkrMapping;
  ideaMapping: IdeaMapping;
  sections: Section[];
  section: number; // index into sections, -1 = whole sheet
  period: string;
  year: number;
};

function yearFrom(sheet: SheetGrid, fallback: number) {
  const m = /20\d{2}/.exec(`${sheet.name} ${sheet.rows.slice(0, 3).flat().map(line).join(" ")}`);
  return m ? Number(m[0]) : fallback;
}

function configure(sheet: SheetGrid, kind: ImportKind, asOf: string): Config {
  const year = yearFrom(sheet, Number(asOf.slice(0, 4)));
  const base: Config = { kind, headerRow: 0, okrMapping: {}, ideaMapping: {}, sections: [], section: -1, period: "", year };
  if (kind === "OKRS") {
    const d = detectOkr(sheet.rows);
    const headerRow = Math.max(0, d.headerRow);
    const sections = okrSections(sheet.rows, headerRow, d.mapping);
    const section = sections.length - 1;
    const s = sections[section];
    const period = s ? `Q${s.q} ${s.year ?? year}` : "";
    return { ...base, headerRow, okrMapping: d.mapping, sections, section, period };
  }
  if (kind === "IDEAS") {
    const d = detectIdeas(sheet.rows);
    return { ...base, headerRow: Math.max(0, d.headerRow), ideaMapping: d.mapping };
  }
  const d = detectTracker(sheet.rows);
  return { ...base, headerRow: Math.max(0, d.labelRow) };
}

export default function ImportWizard({ defaultMode = "file" }: { defaultMode?: "file" | "paste" }) {
  const [mode, setMode] = useState<"file" | "paste">(defaultMode);
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<SheetGrid[] | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [sheetIdx, setSheetIdx] = useState(-1);
  const [config, setConfig] = useState<Config | null>(null);
  const [asOf, setAsOf] = useState(today());
  const [pending, start] = useTransition();
  const [error, setError] = useState("");

  const guesses = useMemo(() => (sheets ?? []).map((s) => guessKind(s.name, s.rows)), [sheets]);
  const sheet = sheets && sheetIdx >= 0 ? sheets[sheetIdx] : null;

  const plan = useMemo(() => {
    if (!sheet || !config) return null;
    const sec = config.sections[config.section];
    const next = config.sections[config.section + 1];
    try {
      return buildPlan(sheet.rows, {
        kind: config.kind,
        headerRow: config.headerRow,
        okrMapping: config.okrMapping,
        ideaMapping: config.ideaMapping,
        sectionFrom: sec?.row,
        sectionTo: next?.row,
        period: config.period || null,
        year: config.year,
      });
    } catch {
      return null;
    }
  }, [sheet, config]);

  async function readFile(file: File) {
    setReading(true);
    setReadError("");
    setSheets(null);
    setSheetIdx(-1);
    setConfig(null);
    setFileName(file.name);
    try {
      let grids: SheetGrid[];
      if (/\.(csv|tsv|txt)$/i.test(file.name)) {
        const rows = csvToGrid(await file.text());
        grids = [{ name: file.name.replace(/\.\w+$/, ""), rows, totalRows: rows.length }];
      } else {
        const ExcelJS = (await import("exceljs")).default;
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        grids = workbookToGrids(wb);
      }
      if (grids.length === 0) throw new Error("empty");
      setSheets(grids);
      // Pre-select the tab that looks most like OKRs, then requests, then trackers.
      const g = grids.map((s) => guessKind(s.name, s.rows));
      const order: ImportKind[] = ["OKRS", "IDEAS", "METRICS"];
      let best = -1;
      // Among OKR tabs, prefer the one reaching the latest quarter, and originals over copies.
      const latest = (i: number) => {
        const d = detectOkr(grids[i].rows);
        const sec = okrSections(grids[i].rows, Math.max(0, d.headerRow), d.mapping).at(-1);
        return sec ? (sec.year ?? yearFrom(grids[i], 0)) * 10 + sec.q : 0;
      };
      for (const k of order) {
        const candidates = g
          .map((x, i) => ({ x, i, score: k === "OKRS" && x.kind === k ? latest(i) : 0, copy: /copy/i.test(grids[i].name) }))
          .filter(({ x }) => x.kind === k)
          .sort((a, b) => b.score - a.score || Number(a.copy) - Number(b.copy) || b.x.confidence - a.x.confidence);
        if (candidates.length) {
          best = candidates[0].i;
          break;
        }
      }
      if (best >= 0) pick(grids, best, g[best].kind!);
    } catch {
      setReadError("That file couldn't be read. Save it as .xlsx or .csv and try again. (Older .xls files need saving as .xlsx first.)");
    } finally {
      setReading(false);
    }
  }

  function pick(list: SheetGrid[], i: number, kind: ImportKind) {
    setSheetIdx(i);
    setConfig(configure(list[i], kind, asOf));
    setError("");
  }

  function submit() {
    if (!sheet || !config) return;
    const next = config.sections[config.section + 1];
    const rows = (next ? sheet.rows.slice(0, next.row) : sheet.rows).slice(0, 1200).map((r) => r.slice(0, 100));
    setError("");
    start(async () => {
      const r = await createImport({
        fileName,
        sheetName: sheet.name,
        kind: config.kind,
        rows,
        headerRow: config.headerRow,
        okrMapping: config.kind === "OKRS" ? (config.okrMapping as Record<string, number>) : undefined,
        ideaMapping: config.kind === "IDEAS" ? (config.ideaMapping as Record<string, number>) : undefined,
        sectionFrom: config.sections[config.section]?.row,
        sectionTo: next?.row,
        period: config.period || null,
        year: config.year,
        asOf,
      });
      if (r?.error) setError(r.error);
    });
  }

  const headers = sheet && config ? (sheet.rows[config.headerRow] ?? []) : [];
  const width = sheet ? Math.min(40, Math.max(...sheet.rows.slice(0, 30).map((r) => r.length), 1)) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="How to import" className="flex gap-1 self-start rounded-full border border-line bg-card p-1 shadow-[var(--shadow-soft)]">
        <button role="tab" aria-selected={mode === "file"} type="button" onClick={() => setMode("file")} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold ${mode === "file" ? "bg-ink text-white" : "text-ink-2 hover:bg-bg-2"}`}>
          <FileSpreadsheet size={13} aria-hidden /> Upload a spreadsheet
        </button>
        <button role="tab" aria-selected={mode === "paste"} type="button" onClick={() => setMode("paste")} className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold ${mode === "paste" ? "bg-ink text-white" : "text-ink-2 hover:bg-bg-2"}`}>
          <ClipboardPaste size={13} aria-hidden /> Paste anything
        </button>
      </div>

      {mode === "paste" ? (
        <div className="card p-5 sm:p-6">
          <p className="mb-1 text-sm font-bold">Paste OKRs from anywhere</p>
          <p className="mb-4 text-xs text-muted">A Notion page, a Google Doc, a slide&apos;s text, or rows copied from a sheet. The AI reads it into objectives and key results; you check everything before it&apos;s saved.</p>
          <ActionForm action={createImportFromText} submit="Read it" pending="Reading…" className="flex flex-col gap-3">
            <textarea name="text" required className="field min-h-64 font-mono text-xs" placeholder={"Help students study regularly\n- Seven-day study activation from 17% to 25% (now 21%)\n- MASS from 6,776 to 12,000 (now 7,003)\n\nRemove blockers to institutional onboarding\n- Deploy Cubbes Web with 100% of agreed requirements (done)"} aria-label="Your OKRs" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="p-period">Period</label>
                <input id="p-period" name="period" className="field" placeholder="e.g. Q4 2026" />
              </div>
              <div>
                <label className="label" htmlFor="p-asof">Progress as of</label>
                <input id="p-asof" name="asOf" type="date" className="field" defaultValue={today()} />
              </div>
            </div>
          </ActionForm>
        </div>
      ) : (
        <>
          <label className="card flex cursor-pointer flex-col items-center gap-3 border-2 border-dashed border-line-2 px-6 py-10 text-center hover:bg-field">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Upload size={20} aria-hidden /></span>
            <span className="text-sm font-bold">{fileName && !reading ? `${fileName} · choose another file` : "Choose a spreadsheet"}</span>
            <span className="text-xs text-muted">Excel (.xlsx) or CSV. It&apos;s read here in your browser; only the tab you choose is sent.</span>
            <input
              type="file"
              accept=".xlsx,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
              }}
            />
          </label>
          {reading && <p className="text-sm text-muted" role="status">Reading {fileName}…</p>}
          {readError && <p className="text-sm font-semibold text-bad" role="alert">{readError}</p>}

          {sheets && (
            <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
              <div className="card flex flex-col gap-1 p-3">
                <p className="eyebrow px-2 pt-1 pb-2 text-[10px]">{sheets.length} tab{sheets.length === 1 ? "" : "s"} in this file</p>
                <div className="flex max-h-[520px] flex-col gap-1 overflow-y-auto">
                  {sheets
                    .map((s, i) => ({ s, i, g: guesses[i] }))
                    .sort((a, b) => (b.g.kind ? 1 : 0) - (a.g.kind ? 1 : 0))
                    .map(({ s, i, g }) => (
                      <button
                        key={s.name}
                        type="button"
                        onClick={() => pick(sheets, i, g.kind ?? "OKRS")}
                        aria-pressed={i === sheetIdx}
                        className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs hover:bg-bg-2 ${i === sheetIdx ? "bg-bg-2 font-bold" : ""}`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{s.name}</span>
                          <span className="text-[10px] text-subtle">{s.totalRows} rows</span>
                        </span>
                        {g.kind && <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent-ink">{KIND_LABEL[g.kind].label}</span>}
                      </button>
                    ))}
                </div>
              </div>

              {sheet && config ? (
                <div className="card flex flex-col gap-5 p-5 sm:p-6">
                  <div>
                    <p className="text-sm font-extrabold">{sheet.name}</p>
                    <p className="text-xs text-muted">What is this tab?</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(Object.keys(KIND_LABEL) as ImportKind[]).map((k) => {
                      const K = KIND_LABEL[k];
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setConfig(configure(sheet, k, asOf))}
                          aria-pressed={config.kind === k}
                          className={`flex flex-col gap-1 rounded-xl border p-3 text-left ${config.kind === k ? "border-ink bg-field" : "border-line hover:bg-field"}`}
                        >
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold"><K.icon size={13} aria-hidden /> {K.label}</span>
                          <span className="text-[11px] text-muted">{K.help}</span>
                        </button>
                      );
                    })}
                  </div>

                  {config.kind === "OKRS" && config.sections.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="label" htmlFor="w-section">Quarter in this tab</label>
                        <select
                          id="w-section"
                          className="field"
                          value={config.section}
                          onChange={(e) => {
                            const i = Number(e.target.value);
                            const s = config.sections[i];
                            setConfig({ ...config, section: i, period: s ? `Q${s.q} ${s.year ?? config.year}` : config.period });
                          }}
                        >
                          {config.sections.map((s, i) => (
                            <option key={s.row} value={i}>{s.label}{i === config.sections.length - 1 ? " (latest)" : ""}</option>
                          ))}
                          <option value={-1}>The whole tab</option>
                        </select>
                      </div>
                      <div>
                        <label className="label" htmlFor="w-period">Call this period</label>
                        <input id="w-period" className="field" value={config.period} onChange={(e) => setConfig({ ...config, period: e.target.value })} />
                      </div>
                      <div>
                        <label className="label" htmlFor="w-asof">Progress as of</label>
                        <input id="w-asof" type="date" className="field" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                      </div>
                    </div>
                  )}
                  {config.kind === "OKRS" && config.sections.length === 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label" htmlFor="w-period2">Period</label>
                        <input id="w-period2" className="field" value={config.period} placeholder="e.g. Q4 2026" onChange={(e) => setConfig({ ...config, period: e.target.value })} />
                      </div>
                      <div>
                        <label className="label" htmlFor="w-asof2">Progress as of</label>
                        <input id="w-asof2" type="date" className="field" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
                      </div>
                    </div>
                  )}
                  {config.kind === "METRICS" && (
                    <div className="max-w-40">
                      <label className="label" htmlFor="w-year">Year of these weeks</label>
                      <input id="w-year" type="number" className="field" value={config.year} onChange={(e) => setConfig({ ...config, year: Number(e.target.value) || config.year })} />
                    </div>
                  )}

                  {config.kind !== "METRICS" && (
                    <details className="rounded-xl border border-line p-3" open={!plan || (plan.kind === "OKRS" && plan.objectives.length === 0) || (plan.kind === "IDEAS" && plan.ideas.length === 0)}>
                      <summary className="cursor-pointer text-xs font-bold">Column matches {headers.length ? `(header on row ${config.headerRow + 1})` : ""}</summary>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label className="label" htmlFor="w-header">Header row</label>
                          <select id="w-header" className="field" value={config.headerRow} onChange={(e) => setConfig({ ...config, headerRow: Number(e.target.value) })}>
                            {sheet.rows.slice(0, 20).map((r, i) => (
                              <option key={i} value={i}>Row {i + 1}: {r.map(line).filter(Boolean).join(" · ").slice(0, 80) || "(empty)"}</option>
                            ))}
                          </select>
                        </div>
                        {(config.kind === "OKRS" ? (Object.keys(OKR_FIELD_LABEL) as OkrField[]) : (Object.keys(IDEA_FIELD_LABEL) as IdeaField[])).map((f) => {
                          const mapping = (config.kind === "OKRS" ? config.okrMapping : config.ideaMapping) as Record<string, number | undefined>;
                          const label = config.kind === "OKRS" ? OKR_FIELD_LABEL[f as OkrField] : IDEA_FIELD_LABEL[f as IdeaField];
                          return (
                            <div key={f}>
                              <label className="label" htmlFor={`m-${f}`}>{label}</label>
                              <select
                                id={`m-${f}`}
                                className="field"
                                value={mapping[f] ?? ""}
                                onChange={(e) => {
                                  const v = e.target.value === "" ? undefined : Number(e.target.value);
                                  const next = { ...mapping, [f]: v };
                                  if (v === undefined) delete next[f];
                                  setConfig(config.kind === "OKRS" ? { ...config, okrMapping: next } : { ...config, ideaMapping: next });
                                }}
                              >
                                <option value="">Not in this sheet</option>
                                {Array.from({ length: width }, (_, i) => (
                                  <option key={i} value={i}>{colName(i)}{line(headers[i]) ? ` · ${line(headers[i]).slice(0, 40)}` : ""}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}

                  <PlanPreview plan={plan} />

                  <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
                    <button type="button" className="btn-primary" disabled={pending || !plan || (plan.kind === "OKRS" ? plan.objectives.length === 0 : plan.kind === "IDEAS" ? plan.ideas.length === 0 : plan.series.length === 0)} onClick={submit}>
                      {pending ? "Preparing the review…" : "Review before importing"}
                    </button>
                    <span className="text-xs text-muted">Nothing is saved until you approve it on the next screen.</span>
                    {error && <span className="text-xs font-semibold text-bad" role="alert">{error}</span>}
                  </div>
                </div>
              ) : (
                <div className="card flex items-center justify-center p-10 text-sm text-muted">Pick a tab to import.</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PlanPreview({ plan }: { plan: ReturnType<typeof buildPlan> | null }) {
  if (!plan) return null;
  if (plan.kind === "OKRS") {
    const krs = plan.objectives.reduce((a, o) => a + o.keyResults.length, 0);
    if (!plan.objectives.length) return <Found tone="bad">No objectives found yet. Check the column matches and the header row.</Found>;
    return (
      <div className="flex flex-col gap-2">
        <Found>Found {plan.objectives.length} objectives and {krs} key results{plan.period ? ` for ${plan.period}` : ""}.</Found>
        <ul className="flex flex-col gap-1.5">
          {plan.objectives.map((o) => (
            <li key={o.sourceRow} className="rounded-lg bg-field px-3 py-2 text-xs">
              <b>{o.title}</b>
              <span className="text-muted"> · {o.keyResults.length} KR{o.keyResults.length === 1 ? "" : "s"}</span>
              {o.keyResults.some((k) => k.warnings.length) && <AlertTriangle size={11} aria-label="Has things to check" className="ml-1 inline text-warn" />}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (plan.kind === "IDEAS") {
    if (!plan.ideas.length) return <Found tone="bad">No requests found. Check the column matches.</Found>;
    const decided = plan.ideas.filter((i) => i.status !== "NEW").length;
    return (
      <div className="flex flex-col gap-2">
        <Found>Found {plan.ideas.length} requests; {decided} already have a decision ({plan.ideas.filter((i) => i.resolved).length} resolved).</Found>
        <ul className="flex flex-col gap-1">
          {plan.ideas.slice(0, 6).map((i) => (
            <li key={i.sourceRow} className="truncate rounded-lg bg-field px-3 py-1.5 text-xs">
              {i.externalId && <span className="text-muted">{i.externalId} · </span>}
              {i.title}
            </li>
          ))}
          {plan.ideas.length > 6 && <li className="px-3 text-[11px] text-subtle">and {plan.ideas.length - 6} more</li>}
        </ul>
      </div>
    );
  }
  if (!plan.series.length) return <Found tone="bad">No weekly values found in this tab.</Found>;
  const withData = plan.series.filter((s) => s.points.length);
  const dates = withData.flatMap((s) => s.points.map((p) => p.date)).sort();
  return (
    <div className="flex flex-col gap-2">
      <Found>
        Found {plan.series.length} metrics; {withData.length} have readings{dates.length ? ` from ${dates[0]} to ${dates.at(-1)}` : ""}.
      </Found>
      <ul className="flex flex-col gap-1">
        {plan.series.slice(0, 6).map((s) => (
          <li key={s.sourceRow} className="flex justify-between gap-2 rounded-lg bg-field px-3 py-1.5 text-xs">
            <span className="truncate">{s.name}</span>
            <span className="shrink-0 text-muted">{s.points.length} weeks</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Found({ children, tone = "good" }: { children: React.ReactNode; tone?: "good" | "bad" }) {
  return (
    <p className={`flex items-center gap-1.5 text-sm font-semibold ${tone === "good" ? "text-good" : "text-bad"}`}>
      {tone === "good" ? <Check size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />} {children}
    </p>
  );
}
