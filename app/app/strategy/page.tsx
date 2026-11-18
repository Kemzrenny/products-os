import Link from "next/link";
import { Plus, Pencil, Trash2, AlertTriangle, Upload } from "lucide-react";
import Sparkline from "@/components/Sparkline";
import { quarterOf } from "@/lib/import/values";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { loadStrategy, objectiveProgress, krProgress } from "@/lib/strategy";
import { atLeast } from "@/lib/roles";
import { OBJECTIVE_STATUS, WORK_STATUS } from "@/lib/labels";
import { fmtDate, dateInput, timeAgo } from "@/lib/format";
import { PageHeader, Section, Chip, Progress, Empty, Notice } from "@/components/ui";
import { ActionForm, ActionButton, AutoSelect } from "@/components/forms";
import { updateOrganisation } from "@/app/actions/org";
import { savePillar, deletePillar, saveObjective, deleteObjective, setObjectiveStatus, setObjectiveProgress, saveOkr, deleteOkr, saveKeyResult, deleteKeyResult } from "@/app/actions/strategy";

export const metadata = { title: "Strategy" };

export default async function StrategyPage({ searchParams }: PageProps<"/app/strategy">) {
  const ctx = await getCtx();
  const { welcome, period: periodParam, imported } = await searchParams;
  const s = await loadStrategy(ctx.workspace.id);
  // Objectives are usually set per quarter: show the latest quarter unless asked otherwise.
  const periods = [...new Set(s.objectives.map((o) => o.period).filter((p): p is string => !!p))].sort((a, b) => {
    const qa = quarterOf(a);
    const qb = quarterOf(b);
    return (qb?.year ?? 0) * 10 + (qb?.q ?? 0) - ((qa?.year ?? 0) * 10 + (qa?.q ?? 0));
  });
  const period = typeof periodParam === "string" ? periodParam : (periods[0] ?? "all");
  const shown = period === "all" ? s.objectives : s.objectives.filter((o) => o.period === period || !o.period);
  const [initiatives, versions] = await Promise.all([
    prisma.initiative.findMany({ where: { workspaceId: ctx.workspace.id }, include: { objectives: { select: { objectiveId: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.strategyVersion.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { version: "desc" }, take: 6 }),
  ]);
  const admin = ctx.role === "ADMIN";
  const editor = atLeast(ctx.role, "EDITOR");
  const unaligned = initiatives.filter((i) => i.objectives.length === 0);

  return (
    <>
      <PageHeader
        crumbs={["Strategy", "Overview"]}
        title="Strategy"
        lead="Vision, pillars, objectives and OKRs, connected to the initiatives that serve them. Every idea is judged against this."
      >
        <Chip tone="blue" dot={false}>Strategy v{ctx.workspace.strategyVersion}</Chip>
        {admin && (
          <Link href="/app/import" className="btn-quiet">
            <Upload size={14} aria-hidden /> Import OKRs
          </Link>
        )}
      </PageHeader>

      {imported && <Notice tone="green"><b>Import complete.</b> Your objectives, key results and progress so far are below. Check-ins from the sheet show as each key result&apos;s trend.</Notice>}

      {periods.length > 0 && (
        <nav aria-label="Period" className="flex flex-wrap gap-1 self-start rounded-full border border-line bg-card p-1 shadow-[var(--shadow-soft)]">
          {[...periods, "all"].map((p) => (
            <Link key={p} href={`/app/strategy?period=${encodeURIComponent(p)}`} aria-current={p === period ? "page" : undefined} className={`rounded-full px-3 py-1.5 text-xs font-bold ${p === period ? "bg-ink text-white" : "text-ink-2 hover:bg-bg-2"}`}>
              {p === "all" ? "All periods" : p}
            </Link>
          ))}
        </nav>
      )}

      {welcome && (
        <Notice tone="blue">
          <b>Welcome to {ctx.org.name}.</b> Already have OKRs in a spreadsheet? <Link className="link" href="/app/import">Import them with your progress so far</Link>. Otherwise add one to three company objectives first. Then add your products and their KPIs, and invite your team from Settings.
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="flex flex-col gap-6">
          <Section title="Company vision">
            {admin ? (
              <ActionForm action={updateOrganisation} submit="Save vision" submitClass="btn-quiet btn-sm">
                <input type="hidden" name="name" value={ctx.org.name} />
                <textarea name="vision" className="field min-h-20" defaultValue={ctx.org.vision ?? ""} placeholder="Where the company is going, in a sentence or two." aria-label="Company vision" />
              </ActionForm>
            ) : (
              <p className="display text-2xl">{ctx.org.vision ?? "No vision written yet."}</p>
            )}
          </Section>

          <Section title={`Company objectives (${shown.length})`}>
            <div className="flex flex-col gap-4">
              {s.objectives.length === 0 && (
                <Empty title="No objectives yet" action={admin ? <Link href="/app/import" className="btn-quiet"><Upload size={14} aria-hidden /> Import from a spreadsheet</Link> : undefined}>
                  What does the business need to achieve this period? For example, &ldquo;Grow paying subscribers 40% by June&rdquo;.
                </Empty>
              )}
              {shown.map((o) => {
                const pillar = s.pillars.find((p) => p.id === o.pillarId);
                const serving = initiatives.filter((i) => i.objectives.some((x) => x.objectiveId === o.id));
                const progress = objectiveProgress(o);
                const measured = [...o.keyResults, ...o.okrs.flatMap((k) => k.keyResults)].some((kr) => krProgress(kr) !== null);
                return (
                  <article key={o.id} id={`o-${o.id}`} className="scroll-mt-24 rounded-2xl border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {(pillar || o.period) && <p className="eyebrow mb-1 text-[10px]">{[o.period, pillar?.name].filter(Boolean).join(" · ")}</p>}
                        <h3 className="text-[15px] font-extrabold">{o.title}</h3>
                        <p className="mt-0.5 text-xs text-muted">
                          {o.metric ? `Measured by ${o.metric}` : "No metric yet"}
                          {o.target ? ` · target ${o.target}` : ""}
                          {o.dueDate ? ` · by ${fmtDate(o.dueDate)}` : ""}
                        </p>
                      </div>
                      {editor ? (
                        <AutoSelect
                          action={setObjectiveStatus.bind(null, o.id)}
                          name="status"
                          label="Objective status"
                          value={o.status}
                          options={Object.entries(OBJECTIVE_STATUS).map(([value, v]) => ({ value, label: v.label }))}
                        />
                      ) : (
                        <Chip tone={OBJECTIVE_STATUS[o.status].tone}>{OBJECTIVE_STATUS[o.status].label}</Chip>
                      )}
                    </div>
                    <div className="mt-3">
                      <Progress value={progress} label={`${o.title} progress`} />
                      <p className="mt-1 text-[11px] text-subtle">{measured ? "Rolled up from key results" : "Set by hand"}</p>
                    </div>
                    {o.description && <p className="mt-2 text-sm text-ink-2">{o.description}</p>}

                    <div className="mt-4">
                      <p className="eyebrow mb-2 text-[10px]">Key results ({o.keyResults.length})</p>
                      {o.keyResults.length === 0 && <p className="text-xs text-muted">None yet. Add how you&apos;ll measure this objective.</p>}
                      <ul className="flex flex-col gap-2.5">
                        {o.keyResults.map((kr) => (
                          <KeyResultRow key={kr.id} kr={kr} objectiveId={o.id} editor={editor} />
                        ))}
                      </ul>
                      {editor && (
                        <details className="mt-2">
                          <summary className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-bold text-accent"><Plus size={11} aria-hidden /> Key result</summary>
                          <div className="mt-2">
                            <DirectKrFields objectiveId={o.id} />
                          </div>
                        </details>
                      )}
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="eyebrow mb-1.5 text-[10px]">Initiatives serving it ({serving.length})</p>
                        {serving.length === 0 ? (
                          <p className="flex items-center gap-1.5 text-xs font-semibold text-warn"><AlertTriangle size={13} aria-hidden /> Nothing on the roadmap serves this yet</p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {serving.map((i) => (
                              <li key={i.id} className="flex items-center justify-between gap-2 text-xs">
                                <Link href={`/app/initiatives/${i.id}`} className="truncate font-semibold hover:underline">{i.title}</Link>
                                <Chip tone={WORK_STATUS[i.status].tone}>{WORK_STATUS[i.status].label}</Chip>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      <div>
                        <p className="eyebrow mb-1.5 text-[10px]">Product OKRs ({o.okrs.length})</p>
                        {o.okrs.length === 0 ? (
                          <p className="text-xs text-muted">No product OKRs contribute yet.</p>
                        ) : (
                          <ul className="flex flex-col gap-1">
                            {o.okrs.map((k) => (
                              <li key={k.id} className="text-xs">
                                <a href={`#okr-${k.id}`} className="font-semibold hover:underline">{k.title}</a> <span className="text-muted">· {k.product.name}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    {(admin || editor) && (
                      <details className="mt-3 border-t border-line pt-3">
                        <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-accent"><Pencil size={12} aria-hidden /> Edit</summary>
                        <div className="mt-3 flex flex-col gap-4">
                          {editor && !measured && (
                            <ActionForm action={setObjectiveProgress} submit="Set progress" submitClass="btn-quiet btn-sm" className="flex flex-wrap items-end gap-3">
                              <input type="hidden" name="id" value={o.id} />
                              <div>
                                <label className="label" htmlFor={`p-${o.id}`}>Progress (%)</label>
                                <input id={`p-${o.id}`} name="progress" type="number" min={0} max={100} className="field w-28" defaultValue={o.progress} />
                              </div>
                            </ActionForm>
                          )}
                          {admin && (
                            <>
                              <ObjectiveFields action={saveObjective} pillars={s.pillars} o={o} />
                              <ActionButton action={deleteObjective.bind(null, o.id)} className="btn-danger btn-sm self-start" confirm={`Delete "${o.title}"? Initiatives stay but lose this link.`}>
                                <Trash2 size={13} aria-hidden /> Delete objective
                              </ActionButton>
                            </>
                          )}
                        </div>
                      </details>
                    )}
                  </article>
                );
              })}
              {admin && (
                <details className="rounded-2xl border border-dashed border-line-2 p-4" open={s.objectives.length === 0}>
                  <summary className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-bold"><Plus size={14} aria-hidden /> Add a company objective</summary>
                  <div className="mt-4">
                    <ObjectiveFields action={saveObjective} pillars={s.pillars} />
                  </div>
                </details>
              )}
            </div>
          </Section>

          <Section title="Product OKRs" action={<Link href="/app/products" className="link text-xs">Products & KPIs</Link>}>
            {s.products.length === 0 ? (
              <Empty title="No products yet">Add a product first, then give it OKRs.</Empty>
            ) : (
              <div className="flex flex-col gap-5">
                {s.products.map((p) => (
                  <div key={p.id}>
                    <p className="text-sm font-extrabold">{p.name}</p>
                    {p.vision && <p className="text-xs text-muted">Vision: {p.vision}</p>}
                    <div className="mt-2 flex flex-col gap-3">
                      {p.okrs.length === 0 && <p className="text-xs text-muted">No OKRs yet.</p>}
                      {p.okrs.map((k) => {
                        const obj = s.objectives.find((o) => o.id === k.objectiveId);
                        return (
                          <div key={k.id} id={`okr-${k.id}`} className="scroll-mt-24 rounded-xl border border-line p-3.5">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="text-sm font-bold">{k.title}</p>
                                <p className="text-[11px] text-muted">
                                  {k.period ?? "No period"} · {obj ? <>contributes to <a className="link" href={`#o-${obj.id}`}>{obj.title}</a></> : "not linked to a company objective"}
                                </p>
                              </div>
                              {editor && (
                                <ActionButton action={deleteOkr.bind(null, k.id)} className="btn-ghost btn-sm text-bad" confirm={`Delete the OKR "${k.title}"?`} showResult={false}>
                                  <Trash2 size={13} aria-label="Delete OKR" />
                                </ActionButton>
                              )}
                            </div>
                            <ul className="mt-2 flex flex-col gap-2">
                              {k.keyResults.map((kr) => {
                                const v = krProgress(kr);
                                return (
                                  <li key={kr.id} className="rounded-lg bg-field p-2.5">
                                    <div className="flex items-center justify-between gap-2">
                                      <p className="text-xs font-semibold">{kr.title}</p>
                                      <span className="text-[11px] text-muted tabular-nums">
                                        {kr.current ?? "–"} / {kr.target ?? "–"} {kr.unit ?? ""}
                                      </span>
                                    </div>
                                    {v !== null && <div className="mt-1.5"><Progress value={v} label={kr.title} /></div>}
                                    {editor && (
                                      <details className="mt-1.5">
                                        <summary className="cursor-pointer text-[11px] font-bold text-accent">Update</summary>
                                        <div className="mt-2 flex flex-col gap-2">
                                          <KrFields okrId={k.id} kpis={p.kpis} kr={kr} />
                                          <ActionButton action={deleteKeyResult.bind(null, kr.id)} className="btn-ghost btn-sm self-start text-bad" confirm="Delete this key result?">
                                            Delete
                                          </ActionButton>
                                        </div>
                                      </details>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                            {editor && (
                              <details className="mt-2">
                                <summary className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-bold text-accent"><Plus size={11} aria-hidden /> Key result</summary>
                                <div className="mt-2">
                                  <KrFields okrId={k.id} kpis={p.kpis} />
                                </div>
                              </details>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {editor && (
                  <details className="rounded-2xl border border-dashed border-line-2 p-4">
                    <summary className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-bold"><Plus size={14} aria-hidden /> Add a product OKR</summary>
                    <ActionForm action={saveOkr} submit="Add OKR" reset className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="label" htmlFor="okr-product">Product</label>
                        <select id="okr-product" name="productId" className="field" required>
                          {s.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label" htmlFor="okr-obj">Contributes to</label>
                        <select id="okr-obj" name="objectiveId" className="field">
                          <option value="">No company objective</option>
                          {s.objectives.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="label" htmlFor="okr-title">Objective</label>
                        <input id="okr-title" name="title" className="field" required placeholder="e.g. Make paying for a subscription effortless" />
                      </div>
                      <div>
                        <label className="label" htmlFor="okr-period">Period</label>
                        <input id="okr-period" name="period" className="field" placeholder="e.g. Q1 2027" />
                      </div>
                    </ActionForm>
                  </details>
                )}
              </div>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-6">
          <Section title={`Strategic pillars (${s.pillars.length})`}>
            <ul className="flex flex-col gap-2.5">
              {s.pillars.length === 0 && <li className="text-xs text-muted">Pillars group objectives into a few big themes, such as &ldquo;Growth&rdquo; or &ldquo;Retention&rdquo;.</li>}
              {s.pillars.map((p) => (
                <li key={p.id} className="rounded-xl bg-field p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold">{p.name}</p>
                      {p.description && <p className="text-xs text-muted">{p.description}</p>}
                      <p className="mt-1 text-[11px] text-subtle">{s.objectives.filter((o) => o.pillarId === p.id).length} objectives</p>
                    </div>
                    {admin && (
                      <ActionButton action={deletePillar.bind(null, p.id)} className="btn-ghost btn-sm text-bad" confirm={`Delete the pillar "${p.name}"?`} showResult={false}>
                        <Trash2 size={13} aria-label="Delete pillar" />
                      </ActionButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {admin && (
              <details className="mt-3">
                <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-accent"><Plus size={12} aria-hidden /> Add a pillar</summary>
                <ActionForm action={savePillar} submit="Add pillar" reset submitClass="btn-quiet btn-sm" className="mt-3 flex flex-col gap-3">
                  <input name="name" className="field" required placeholder="Pillar name" aria-label="Pillar name" />
                  <input name="description" className="field" placeholder="What it means (optional)" aria-label="Pillar description" />
                </ActionForm>
              </details>
            )}
          </Section>

          {unaligned.length > 0 && (
            <Section title={<span className="inline-flex items-center gap-2 text-warn"><AlertTriangle size={15} aria-hidden /> Unaligned initiatives</span>}>
              <p className="mb-2 text-xs text-muted">These initiatives serve no objective. Link them, or ask the Strategy Agent.</p>
              <ul className="flex flex-col gap-1.5">
                {unaligned.map((i) => (
                  <li key={i.id}>
                    <Link href={`/app/initiatives/${i.id}`} className="text-sm font-semibold hover:underline">{i.title}</Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Strategy history">
            <ul className="flex flex-col gap-2">
              {versions.map((v) => (
                <li key={v.id} className="flex items-start gap-2 text-xs">
                  <Chip dot={false}>v{v.version}</Chip>
                  <span className="text-ink-2">{v.note ?? "Updated"} <span className="text-subtle">· {timeAgo(v.createdAt)}</span></span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-subtle">Every evaluation and decision records the version it was made under.</p>
          </Section>
        </aside>
      </div>
    </>
  );
}

function ObjectiveFields({ action, pillars, o }: { action: typeof saveObjective; pillars: { id: string; name: string }[]; o?: { id: string; title: string; description: string | null; metric: string | null; target: string | null; dueDate: Date | null; pillarId: string | null; period: string | null } }) {
  const p = o?.id ?? "new";
  return (
    <ActionForm action={action} submit={o ? "Save objective" : "Add objective"} reset={!o} className="grid gap-3 sm:grid-cols-2">
      {o && <input type="hidden" name="id" value={o.id} />}
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`t-${p}`}>Objective</label>
        <input id={`t-${p}`} name="title" className="field" required defaultValue={o?.title} placeholder="e.g. Grow paying subscribers" />
      </div>
      <div>
        <label className="label" htmlFor={`m-${p}`}>Measured by</label>
        <input id={`m-${p}`} name="metric" className="field" defaultValue={o?.metric ?? ""} placeholder="e.g. Paying subscribers" />
      </div>
      <div>
        <label className="label" htmlFor={`tg-${p}`}>Target</label>
        <input id={`tg-${p}`} name="target" className="field" defaultValue={o?.target ?? ""} placeholder="e.g. +40% (12,000)" />
      </div>
      <div>
        <label className="label" htmlFor={`pe-${p}`}>Period</label>
        <input id={`pe-${p}`} name="period" className="field" defaultValue={o?.period ?? ""} placeholder="e.g. Q4 2026" />
      </div>
      <div>
        <label className="label" htmlFor={`d-${p}`}>Due</label>
        <input id={`d-${p}`} name="dueDate" type="date" className="field" defaultValue={dateInput(o?.dueDate)} />
      </div>
      <div>
        <label className="label" htmlFor={`pl-${p}`}>Pillar</label>
        <select id={`pl-${p}`} name="pillarId" className="field" defaultValue={o?.pillarId ?? ""}>
          <option value="">None</option>
          {pillars.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`de-${p}`}>Why it matters <span className="font-normal text-muted">(optional)</span></label>
        <textarea id={`de-${p}`} name="description" className="field min-h-16" defaultValue={o?.description ?? ""} />
      </div>
    </ActionForm>
  );
}

function KrFields({ okrId, kpis, kr }: { okrId: string; kpis: { id: string; name: string }[]; kr?: { id: string; title: string; kpiId: string | null; baseline: number | null; current: number | null; target: number | null; unit: string | null } }) {
  const p = kr?.id ?? `new-${okrId}`;
  return (
    <ActionForm action={saveKeyResult} submit={kr ? "Save" : "Add key result"} reset={!kr} submitClass="btn-quiet btn-sm" className="grid gap-2 sm:grid-cols-4">
      <input type="hidden" name="okrId" value={okrId} />
      {kr && <input type="hidden" name="id" value={kr.id} />}
      <div className="sm:col-span-4">
        <label className="label" htmlFor={`kt-${p}`}>Key result</label>
        <input id={`kt-${p}`} name="title" className="field" required defaultValue={kr?.title} placeholder="e.g. Checkout conversion from 2.1% to 3.5%" />
      </div>
      <div>
        <label className="label" htmlFor={`kb-${p}`}>Baseline</label>
        <input id={`kb-${p}`} name="baseline" className="field" inputMode="decimal" defaultValue={kr?.baseline ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`kc-${p}`}>Current</label>
        <input id={`kc-${p}`} name="current" className="field" inputMode="decimal" defaultValue={kr?.current ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`kg-${p}`}>Target</label>
        <input id={`kg-${p}`} name="target" className="field" inputMode="decimal" defaultValue={kr?.target ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`ku-${p}`}>Unit</label>
        <input id={`ku-${p}`} name="unit" className="field" defaultValue={kr?.unit ?? ""} placeholder="%" />
      </div>
      {kpis.length > 0 && (
        <div className="sm:col-span-4">
          <label className="label" htmlFor={`kk-${p}`}>Tracks KPI</label>
          <select id={`kk-${p}`} name="kpiId" className="field" defaultValue={kr?.kpiId ?? ""}>
            <option value="">None</option>
            {kpis.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        </div>
      )}
    </ActionForm>
  );
}

type DirectKr = {
  id: string;
  title: string;
  baseline: number | null;
  current: number | null;
  target: number | null;
  unit: string | null;
  status: keyof typeof WORK_STATUS | null;
  leadNames: string | null;
  dueDate: Date | null;
  note: string | null;
  checkins: { date: Date; value: number; note: string | null; source: string }[];
};

function KeyResultRow({ kr, objectiveId, editor }: { kr: DirectKr; objectiveId: string; editor: boolean }) {
  const v = krProgress(kr);
  const u = kr.unit ?? "";
  const last = kr.checkins.at(-1);
  return (
    <li className="rounded-xl bg-field p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs font-semibold">{kr.title}</p>
        {kr.status && <Chip tone={WORK_STATUS[kr.status].tone}>{WORK_STATUS[kr.status].label}</Chip>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs tabular-nums">
          <b className="text-sm">{kr.current ?? "–"}{u}</b> <span className="text-muted">of {kr.target ?? "–"}{u}{kr.baseline !== null ? `, from ${kr.baseline}${u}` : ""}</span>
        </span>
        <Sparkline points={kr.checkins} target={kr.target} unit={kr.unit} />
        {(kr.leadNames || kr.dueDate) && <span className="text-[11px] text-muted">{[kr.leadNames, kr.dueDate ? `due ${fmtDate(kr.dueDate)}` : null].filter(Boolean).join(" · ")}</span>}
      </div>
      {v !== null && <div className="mt-2"><Progress value={v} label={kr.title} /></div>}
      {last && <p className="mt-1 text-[11px] text-subtle">Last reading {fmtDate(last.date)}{last.source === "import" ? " (imported)" : ""} · {kr.checkins.length} reading{kr.checkins.length === 1 ? "" : "s"}</p>}
      {kr.note && (
        <details className="mt-1.5 text-xs">
          <summary className="cursor-pointer font-bold text-accent">Latest update</summary>
          <p className="mt-1 whitespace-pre-line text-ink-2">{kr.note}</p>
        </details>
      )}
      {editor && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-[11px] font-bold text-accent">Check in</summary>
          <div className="mt-2 flex flex-col gap-2">
            <DirectKrFields objectiveId={objectiveId} kr={kr} />
            <ActionButton action={deleteKeyResult.bind(null, kr.id)} className="btn-ghost btn-sm self-start text-bad" confirm="Delete this key result and its history?">
              Delete key result
            </ActionButton>
          </div>
        </details>
      )}
    </li>
  );
}

// Adding a key result to an objective, or checking in on one: a new current value is
// recorded with its date, so the trend builds up week by week.
function DirectKrFields({ objectiveId, kr }: { objectiveId: string; kr?: DirectKr }) {
  const p = kr?.id ?? `new-${objectiveId}`;
  return (
    <ActionForm action={saveKeyResult} submit={kr ? "Save check-in" : "Add key result"} reset={!kr} submitClass="btn-quiet btn-sm" className="grid gap-2 sm:grid-cols-4">
      <input type="hidden" name="objectiveId" value={objectiveId} />
      {kr && <input type="hidden" name="id" value={kr.id} />}
      <div className="sm:col-span-4">
        <label className="label" htmlFor={`dt-${p}`}>Key result</label>
        <input id={`dt-${p}`} name="title" className="field" required defaultValue={kr?.title} placeholder="e.g. Seven-day study activation from 17% to 25%" />
      </div>
      <div>
        <label className="label" htmlFor={`dc-${p}`}>{kr ? "Value now" : "Current"}</label>
        <input id={`dc-${p}`} name="current" className="field" inputMode="decimal" defaultValue={kr?.current ?? ""} />
      </div>
      {kr ? (
        <div>
          <label className="label" htmlFor={`da-${p}`}>As of</label>
          <input id={`da-${p}`} name="asOf" type="date" className="field" defaultValue={new Date().toISOString().slice(0, 10)} />
        </div>
      ) : (
        <div>
          <label className="label" htmlFor={`db-${p}`}>Start</label>
          <input id={`db-${p}`} name="baseline" className="field" inputMode="decimal" />
        </div>
      )}
      <div>
        <label className="label" htmlFor={`dg-${p}`}>Target</label>
        <input id={`dg-${p}`} name="target" className="field" inputMode="decimal" defaultValue={kr?.target ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`du-${p}`}>Unit</label>
        <input id={`du-${p}`} name="unit" className="field" defaultValue={kr?.unit ?? ""} placeholder="%" />
      </div>
      {kr && <input type="hidden" name="baseline" value={kr.baseline ?? ""} />}
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`ds-${p}`}>Status</label>
        <select id={`ds-${p}`} name="status" className="field" defaultValue={kr?.status ?? ""}>
          <option value="">Not set</option>
          {Object.entries(WORK_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`dl-${p}`}>Leads</label>
        <input id={`dl-${p}`} name="leadNames" className="field" defaultValue={kr?.leadNames ?? ""} />
      </div>
      <div className="sm:col-span-4">
        <label className="label" htmlFor={`dn-${p}`}>Update note <span className="font-normal text-muted">(optional)</span></label>
        <textarea id={`dn-${p}`} name="note" className="field min-h-14" placeholder="What changed since the last check-in?" />
      </div>
    </ActionForm>
  );
}
