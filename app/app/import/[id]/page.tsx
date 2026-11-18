import { notFound } from "next/navigation";
import { AlertTriangle, Users } from "lucide-react";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { fmtDate, dateInput } from "@/lib/format";
import { krProgress } from "@/lib/strategy";
import { WORK_STATUS, IDEA_STATUS } from "@/lib/labels";
import { PageHeader, Section, Chip, Notice, Progress } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/forms";
import { applyImport, discardImport } from "@/app/actions/import";
import { initiativeTitle } from "@/lib/import/okr";
import { similarity } from "@/lib/import/values";
import { teamMatcher, periodStart } from "@/lib/import/apply";
import type { ImportPlan, OkrPlan, IdeaPlan, MetricsPlan } from "@/lib/import/types";

export const metadata = { title: "Review import" };

export default async function ReviewImport({ params }: PageProps<"/app/import/[id]">) {
  const ctx = await getCtx("ADMIN");
  const { id } = await params;
  const job = await prisma.importJob.findFirst({ where: { id, workspaceId: ctx.workspace.id } });
  if (!job) notFound();
  const plan = job.plan as unknown as ImportPlan;
  const done = job.status !== "PENDING";

  return (
    <>
      <PageHeader crumbs={["Strategy", "Import", "Review"]} title={`Review: ${job.fileName}${job.sheetName ? ` › ${job.sheetName}` : ""}`} lead={`${job.summary}. Untick anything you don't want, fix any numbers, then import.`}>
        {!done && (
          <ActionButton action={discardImport.bind(null, job.id)} className="btn-ghost" confirm="Discard this import? Nothing has been saved from it." showResult={false}>
            Discard
          </ActionButton>
        )}
      </PageHeader>
      {done && <Notice tone={job.status === "APPLIED" ? "green" : "grey"}>{job.status === "APPLIED" ? `Imported on ${fmtDate(job.appliedAt)}. ${job.summary}.` : "This import was discarded."}</Notice>}

      {!done && (
        <ActionForm action={applyImport} submit="Import" pending="Importing…" className="flex flex-col gap-6">
          <input type="hidden" name="id" value={job.id} />
          {plan.kind === "OKRS" && <OkrReview plan={plan} asOf={job.asOf} />}
          {plan.kind === "IDEAS" && <IdeaReview plan={plan} />}
          {plan.kind === "METRICS" && <MetricsReview plan={plan} />}
        </ActionForm>
      )}
    </>
  );

  async function OkrReview({ plan, asOf }: { plan: OkrPlan; asOf: Date }) {
    const [existingObjectives, match] = await Promise.all([
      prisma.objective.findMany({ where: { workspaceId: ctx.workspace.id }, select: { title: true, period: true } }),
      teamMatcher(ctx.org.id),
    ]);
    const exists = (t: string) => existingObjectives.some((o) => o.title.toLowerCase() === t.toLowerCase());
    const start = periodStart(plan.period, asOf);
    let n = 0;
    return (
      <>
        <Section title="Period and progress">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="period">Period</label>
              <input id="period" name="period" className="field" defaultValue={plan.period ?? ""} placeholder="e.g. Q4 2026" />
            </div>
            <div>
              <label className="label" htmlFor="asOf">Current values are as of</label>
              <input id="asOf" name="asOf" type="date" className="field" defaultValue={dateInput(asOf)} />
            </div>
            <div className="flex flex-col justify-end gap-2 text-xs">
              <label className="flex items-start gap-2">
                <input type="checkbox" name="baselineCheckin" defaultChecked className="mt-0.5" />
                <span>Record each starting value on {start ? fmtDate(start) : "the first day of the quarter"}, so the trend starts there</span>
              </label>
              <label className="flex items-start gap-2">
                <input type="checkbox" name="createInitiatives" defaultChecked className="mt-0.5" />
                <span>Turn each key result&apos;s plan into a roadmap initiative</span>
              </label>
            </div>
          </div>
        </Section>

        {plan.objectives.map((o, oi) => (
          <Section
            key={oi}
            title={
              <label className="flex items-center gap-2.5">
                <input type="checkbox" name={`o${oi}.include`} defaultChecked={!o.keyResults.every((k) => k.skip)} aria-label={`Import ${o.title}`} />
                <span>Objective {oi + 1}</span>
                {exists(o.title) && <Chip tone="blue">Already here · will be updated</Chip>}
              </label>
            }
          >
            <input name={`o${oi}.title`} defaultValue={o.title} className="field mb-4 font-bold" aria-label="Objective" />
            <div className="flex flex-col gap-3">
              {o.keyResults.map((k, ki) => {
                const f = `k${oi}_${ki}`;
                n++;
                const p = krProgress(k);
                const matched = k.leads.map((l) => ({ l, m: match(l) }));
                return (
                  <div key={ki} className={`rounded-2xl border p-4 ${k.skip ? "border-dashed border-line-2 bg-bg" : "border-line"}`}>
                    <div className="flex items-start gap-3">
                      <input type="checkbox" name={`${f}.include`} defaultChecked={!k.skip} className="mt-2.5" aria-label={`Import key result ${n}`} />
                      <div className="flex min-w-0 flex-1 flex-col gap-3">
                        <textarea name={`${f}.title`} defaultValue={k.title} rows={2} className="field text-sm font-semibold" aria-label="Key result" />
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                          <Num name={`${f}.baseline`} label="Start" value={k.baseline} />
                          <Num name={`${f}.current`} label="Current" value={k.current} />
                          <Num name={`${f}.target`} label="Target" value={k.target} />
                          <div>
                            <label className="label" htmlFor={`${f}.unit`}>Unit</label>
                            <input id={`${f}.unit`} name={`${f}.unit`} className="field" defaultValue={k.unit ?? ""} placeholder="%" />
                          </div>
                          <div className="col-span-2">
                            <label className="label" htmlFor={`${f}.status`}>Status</label>
                            <select id={`${f}.status`} name={`${f}.status`} className="field" defaultValue={k.status ?? ""}>
                              <option value="">Not set</option>
                              {Object.entries(WORK_STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
                            </select>
                          </div>
                        </div>
                        {p !== null && <Progress value={p} label="Progress" />}
                        <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
                          <div>
                            <label className="label" htmlFor={`${f}.leads`}>Leads</label>
                            <input id={`${f}.leads`} name={`${f}.leads`} className="field" defaultValue={k.leads.join(", ")} />
                            {matched.length > 0 && (
                              <p className="hint flex flex-wrap items-center gap-1">
                                <Users size={11} aria-hidden />
                                {matched.map(({ l, m }) => (m ? `${l} → ${m.name}` : `${l} (not on the team yet)`)).join(" · ")}
                              </p>
                            )}
                          </div>
                          <div>
                            <label className="label" htmlFor={`${f}.due`}>Due</label>
                            <input id={`${f}.due`} name={`${f}.due`} type="date" className="field" defaultValue={k.due ?? ""} />
                          </div>
                        </div>
                        {k.plan && (
                          <div>
                            <label className="label" htmlFor={`${f}.initiative`}>Roadmap initiative from its plan</label>
                            <input id={`${f}.initiative`} name={`${f}.initiative`} className="field" defaultValue={initiativeTitle(k)} />
                          </div>
                        )}
                        {k.warnings.map((w) => (
                          <p key={w} className="flex items-start gap-1.5 text-xs font-semibold text-warn"><AlertTriangle size={13} aria-hidden className="mt-0.5 shrink-0" /> {w}</p>
                        ))}
                        {(k.comment || k.plan) && (
                          <details className="text-xs">
                            <summary className="cursor-pointer font-bold text-accent">Plan and latest update from the sheet</summary>
                            {k.plan && <p className="mt-2 whitespace-pre-line text-ink-2"><b>Plan:</b> {k.plan}</p>}
                            {k.comment && <p className="mt-2 whitespace-pre-line text-ink-2"><b>Update:</b> {k.comment}</p>}
                          </details>
                        )}
                        <p className="text-[11px] text-subtle">Row {k.sourceRow} in the sheet</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        ))}
      </>
    );
  }

  async function IdeaReview({ plan }: { plan: IdeaPlan }) {
    const [products, existing] = await Promise.all([
      prisma.product.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
      prisma.idea.findMany({ where: { workspaceId: ctx.workspace.id, externalId: { in: plan.ideas.map((i) => i.externalId).filter((x): x is string => !!x) } }, select: { externalId: true } }),
    ]);
    const already = new Set(existing.map((e) => e.externalId));
    const cats = [...new Set(plan.ideas.map((i) => i.category?.split(",")[0].trim()).filter((c): c is string => !!c))];
    return (
      <>
        {cats.length > 0 && (
          <Section title="Which product does each category belong to?">
            <div className="grid gap-3 sm:grid-cols-2">
              {cats.map((c, ci) => {
                const hit = products.find((p) => p.name.toLowerCase() === c.toLowerCase());
                return (
                  <div key={c}>
                    <input type="hidden" name={`cat${ci}.name`} value={c} />
                    <label className="label" htmlFor={`cat${ci}`}>{c} <span className="font-normal text-muted">· {plan.ideas.filter((i) => i.category?.split(",")[0].trim() === c).length} requests</span></label>
                    <select id={`cat${ci}`} name={`cat${ci}.to`} className="field" defaultValue={hit ? `product:${hit.id}` : "create"}>
                      {products.map((p) => <option key={p.id} value={`product:${p.id}`}>{p.name}</option>)}
                      {!hit && <option value="create">Create a product called &ldquo;{c}&rdquo;</option>}
                      <option value="none">No product</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </Section>
        )}
        <Section title={`Requests (${plan.ideas.length})`}>
          <p className="mb-3 text-xs text-muted">Resolved or in-progress requests come in as approved, marked &ldquo;recorded at import&rdquo;. New ones wait for evaluation like any idea.</p>
          <ul className="flex flex-col gap-2">
            {plan.ideas.map((i, n) => (
              <li key={n} className="flex items-start gap-3 rounded-xl border border-line p-3">
                <input type="checkbox" name={`i${n}.include`} defaultChecked className="mt-2.5" aria-label={`Import ${i.title}`} />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <input name={`i${n}.title`} defaultValue={i.title} className="field text-sm font-semibold" aria-label="Title" />
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                    {i.externalId && <span className="font-bold text-ink-2">{i.externalId}</span>}
                    {i.type && <span>· {i.type}</span>}
                    {i.priority && <span>· {i.priority} priority</span>}
                    {i.requester && <span>· from {i.requester}</span>}
                    <span>·</span>
                    <Chip tone={IDEA_STATUS[i.status].tone}>{i.rawStatus ? `${i.rawStatus} → ${IDEA_STATUS[i.status].label}` : IDEA_STATUS[i.status].label}</Chip>
                    {i.externalId && already.has(i.externalId) && <Chip tone="blue">Already imported · will be updated</Chip>}
                  </p>
                  {i.description && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-bold text-accent">Full description</summary>
                      <p className="mt-1.5 whitespace-pre-line text-ink-2">{i.description}</p>
                    </details>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </>
    );
  }

  async function MetricsReview({ plan }: { plan: MetricsPlan }) {
    const [krs, products] = await Promise.all([
      prisma.keyResult.findMany({
        where: { OR: [{ objective: { workspaceId: ctx.workspace.id } }, { okr: { product: { workspaceId: ctx.workspace.id } } }] },
        select: { id: true, title: true, unit: true, objective: { select: { title: true, period: true } } },
      }),
      prisma.product.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
    ]);
    return (
      <Section title={`Where should each metric's history go? (${plan.series.length})`}>
        <p className="mb-3 text-xs text-muted">Attach a metric to the key result it measures, or keep it as a product KPI. Each week&apos;s actual becomes a dated reading.</p>
        <ul className="flex flex-col gap-2">
          {plan.series.map((s, n) => {
            // Only suggest a key result from the same quarter as the readings; Q2 history
            // shouldn't land on a Q4 key result just because the names are alike.
            const first = s.points[0]?.date;
            const seriesQ = first ? `Q${Math.floor(Number(first.slice(5, 7)) / 3.01) + 1} ${first.slice(0, 4)}` : null;
            const best = krs
              .filter((k) => !k.objective?.period || !seriesQ || k.objective.period === seriesQ)
              .map((k) => ({ k, score: similarity(s.name, k.title) }))
              .sort((a, b) => b.score - a.score)[0];
            // A matching key result first; otherwise a KPI, unless every reading is zero (an unfilled row).
            const filled = s.points.some((p) => p.value !== 0);
            const preset = best && best.score >= 0.5 ? `kr:${best.k.id}` : filled && products[0] ? `kpi:${products[0].id}` : "skip";
            return (
              <li key={n} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_300px] sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-bold">{s.name}</p>
                  <p className="text-[11px] text-muted">
                    {s.group ? `${s.group} · ` : ""}
                    {s.points.length} weekly reading{s.points.length === 1 ? "" : "s"}
                    {s.points.length ? ` (${s.points[0].date} to ${s.points.at(-1)!.date}, latest ${s.points.at(-1)!.value}${s.unit === "%" ? "%" : ""})` : ""}
                    {s.target !== null ? ` · target ${s.target}${s.unit === "%" ? "%" : ""}` : ""}
                  </p>
                </div>
                <select name={`s${n}.to`} className="field" defaultValue={preset} aria-label={`Where ${s.name} goes`} disabled={!s.points.length}>
                  <option value="skip">Don&apos;t import</option>
                  {krs.length > 0 && (
                    <optgroup label="Key result">
                      {krs.map((k) => <option key={k.id} value={`kr:${k.id}`}>{k.title.slice(0, 70)}{k.objective?.period ? ` (${k.objective.period})` : ""}</option>)}
                    </optgroup>
                  )}
                  {products.length > 0 && (
                    <optgroup label="New KPI on product">
                      {products.map((p) => <option key={p.id} value={`kpi:${p.id}`}>KPI on {p.name}</option>)}
                    </optgroup>
                  )}
                </select>
              </li>
            );
          })}
        </ul>
      </Section>
    );
  }
}

function Num({ name, label, value }: { name: string; label: string; value: number | null }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      <input id={name} name={name} className="field tabular-nums" inputMode="decimal" defaultValue={value ?? ""} />
    </div>
  );
}
