import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles, Pencil, Trash2, ArrowUpRight, Quote, BarChart3, Link2, StickyNote } from "lucide-react";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { atLeast } from "@/lib/roles";
import { IDEA_STATUS, RECOMMENDATION, OUTCOME, EFFORT, type Tone } from "@/lib/labels";
import { fmtDate, timeAgo } from "@/lib/format";
import { aiConfigured } from "@/lib/gemini";
import { PageHeader, Section, Chip, Notice, Avatar } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/forms";
import { addEvidence, deleteEvidence, setEffort, runEvaluation, decide, updateIdea, deleteIdea } from "@/app/actions/ideas";

export const metadata = { title: "Idea" };

const LEVEL_TONE: Record<string, Tone> = { HIGH: "green", MEDIUM: "amber", LOW: "grey" };
const RATING_LABEL: Record<string, string> = {
  alignment: "Strategic alignment",
  customerImpact: "Customer impact",
  businessImpact: "Business impact",
  evidence: "Evidence strength",
  effort: "Effort",
  risk: "Risk",
};
const EVIDENCE_ICON = { QUOTE: Quote, METRIC: BarChart3, LINK: Link2, NOTE: StickyNote };

export default async function IdeaPage({ params, searchParams }: PageProps<"/app/ideas/[id]">) {
  const ctx = await getCtx();
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const idea = await prisma.idea.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: {
      product: true,
      submittedBy: { select: { name: true, id: true } },
      effortBy: { select: { name: true } },
      evidence: { orderBy: { createdAt: "asc" } },
      evaluations: { orderBy: { createdAt: "desc" }, take: 3 },
      decisions: { orderBy: { createdAt: "desc" }, include: { decidedBy: { select: { name: true } } } },
      objectives: { include: { objective: true } },
      initiative: { select: { id: true, title: true } },
    },
  });
  if (!idea) notFound();
  const [objectives, products] = await Promise.all([
    prisma.objective.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "asc" }, select: { id: true, title: true } }),
    prisma.product.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
  ]);
  const ev = idea.evaluations[0];
  const editor = atLeast(ctx.role, "EDITOR");
  const contributor = atLeast(ctx.role, "CONTRIBUTOR");
  const mine = idea.submittedById === ctx.user.id;
  const linked = new Set(idea.objectives.map((o) => o.objectiveId));
  const staleEval = ev && ev.strategyVersion < ctx.workspace.strategyVersion;

  return (
    <>
      <PageHeader
        crumbs={["Ideas", idea.product?.name ?? "Idea"]}
        title={idea.title}
        lead={
          <>
            {idea.source ?? "No source"}
            {idea.requester ? ` (${idea.requester})` : ""} · submitted by {idea.submittedBy.name} {timeAgo(idea.createdAt)}
          </>
        }
      >
        <Chip tone={IDEA_STATUS[idea.status].tone}>{IDEA_STATUS[idea.status].label}</Chip>
        {idea.rank && <Chip dot={false}>Rank #{idea.rank}</Chip>}
      </PageHeader>

      {isNew && <Notice tone="green">Idea submitted.{editor ? " Add evidence and an effort estimate, then run the AI evaluation." : " An editor will evaluate it against the strategy."}</Notice>}
      {idea.initiative && (
        <Notice tone="green">
          Approved and on the roadmap as <Link className="link" href={`/app/initiatives/${idea.initiative.id}`}>{idea.initiative.title}</Link>.
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6">
          <Section
            title={<span className="inline-flex items-center gap-2"><Sparkles size={15} aria-hidden className="text-accent" /> AI evaluation</span>}
            action={
              editor ? (
                <ActionButton action={runEvaluation.bind(null, idea.id)} className={ev ? "btn-quiet btn-sm" : "btn-accent btn-sm"} pending="Evaluating…">
                  <Sparkles size={13} aria-hidden /> {ev ? "Re-evaluate" : "Evaluate with AI"}
                </ActionButton>
              ) : undefined
            }
          >
            {!aiConfigured() && <Notice tone="amber">AI isn&apos;t set up yet. Add a Gemini API key in Vercel to turn on evaluations and agents.</Notice>}
            {!ev ? (
              <p className="text-sm text-muted">
                Not evaluated yet. The Prioritisation Agent rates the idea against your {objectives.length} objective{objectives.length === 1 ? "" : "s"} and explains its recommendation.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-field p-4">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-semibold text-muted">Recommendation</span>
                    <span className="text-lg font-extrabold">{RECOMMENDATION[ev.recommendation].label}</span>
                  </div>
                  <div className="ml-auto flex gap-5">
                    <Score label="Impact" value={ev.impactScore} />
                    <Score label="Strategic fit" value={ev.alignmentScore} />
                  </div>
                </div>
                <p className="text-sm leading-relaxed text-ink-2">{ev.rationale}</p>
                <div className="overflow-hidden rounded-xl border border-line">
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-line">
                      {Object.keys(RATING_LABEL).map((k) => [k, (ev.ratings as Record<string, { level: string; reason: string }>)[k]] as const).filter(([, r]) => r).map(([k, r]) => (
                        <tr key={k}>
                          <th scope="row" className="w-36 bg-field px-3 py-2.5 align-top font-semibold">{RATING_LABEL[k] ?? k}</th>
                          <td className="w-20 px-3 py-2.5 align-top"><Chip tone={k === "effort" || k === "risk" ? (r.level === "HIGH" ? "amber" : "grey") : LEVEL_TONE[r.level]}>{r.level.toLowerCase()}</Chip></td>
                          <td className="px-3 py-2.5 align-top text-ink-2">{r.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {ev.objectiveIds.length > 0 && (
                  <p className="text-xs">
                    <b>Supports:</b>{" "}
                    {ev.objectiveIds.map((oid, i) => {
                      const o = objectives.find((x) => x.id === oid);
                      return o ? (
                        <span key={oid}>
                          {i > 0 && ", "}
                          <Link className="link" href={`/app/strategy#o-${oid}`}>{o.title}</Link>
                        </span>
                      ) : null;
                    })}
                  </p>
                )}
                {ev.openQuestions.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-bold">Answer before committing</p>
                    <ul className="list-disc pl-5 text-xs text-ink-2">
                      {ev.openQuestions.map((q) => <li key={q}>{q}</li>)}
                    </ul>
                  </div>
                )}
                <p className="text-[11px] text-subtle">
                  {ev.model === "fake" ? "Test mode" : ev.model} · strategy v{ev.strategyVersion} · {timeAgo(ev.createdAt)}
                  {staleEval && <span className="font-semibold text-warn"> · strategy has changed since; consider re-evaluating</span>}
                </p>
              </div>
            )}
          </Section>

          <Section title="The problem">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs font-semibold text-muted">Who has it</dt>
                <dd className="mt-1">{idea.problemWho ?? <span className="text-subtle">Not captured</span>}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs font-semibold text-muted">What it is</dt>
                <dd className="mt-1">{idea.problemWhat ?? <span className="text-subtle">Not captured</span>}</dd>
              </div>
              <div className="sm:col-span-3">
                <dt className="text-xs font-semibold text-muted">Why now</dt>
                <dd className="mt-1">{idea.problemWhy ?? <span className="text-subtle">Not captured</span>}</dd>
              </div>
            </dl>
            {idea.description && <p className="mt-4 border-t border-line pt-4 text-sm whitespace-pre-line text-ink-2">{idea.description}</p>}
            {(editor || mine) && (
              <details className="mt-4 border-t border-line pt-3">
                <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-accent"><Pencil size={12} aria-hidden /> Edit idea</summary>
                <ActionForm action={updateIdea} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <input type="hidden" name="id" value={idea.id} />
                  <div className="sm:col-span-2"><label className="label" htmlFor="e-title">Idea</label><input id="e-title" name="title" className="field" defaultValue={idea.title} required /></div>
                  <div>
                    <label className="label" htmlFor="e-product">Product</label>
                    <select id="e-product" name="productId" className="field" defaultValue={idea.productId ?? ""}>
                      <option value="">Not sure / several</option>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div><label className="label" htmlFor="e-source">Source</label><input id="e-source" name="source" className="field" defaultValue={idea.source ?? ""} /></div>
                  <div className="sm:col-span-2"><label className="label" htmlFor="e-req">Requested by</label><input id="e-req" name="requester" className="field" defaultValue={idea.requester ?? ""} /></div>
                  <div><label className="label" htmlFor="e-who">Who has the problem</label><input id="e-who" name="problemWho" className="field" defaultValue={idea.problemWho ?? ""} /></div>
                  <div><label className="label" htmlFor="e-why">Why now</label><input id="e-why" name="problemWhy" className="field" defaultValue={idea.problemWhy ?? ""} /></div>
                  <div className="sm:col-span-2"><label className="label" htmlFor="e-what">The problem</label><textarea id="e-what" name="problemWhat" className="field min-h-16" defaultValue={idea.problemWhat ?? ""} /></div>
                  <div className="sm:col-span-2"><label className="label" htmlFor="e-desc">Anything else</label><textarea id="e-desc" name="description" className="field min-h-16" defaultValue={idea.description ?? ""} /></div>
                </ActionForm>
                {(ctx.role === "ADMIN" || (mine && idea.status === "NEW")) && (
                  <div className="mt-3">
                    <ActionButton action={deleteIdea.bind(null, idea.id)} className="btn-danger btn-sm" confirm="Delete this idea and its history?">
                      <Trash2 size={13} aria-hidden /> Delete idea
                    </ActionButton>
                  </div>
                )}
              </details>
            )}
          </Section>

          <Section title={`Evidence (${idea.evidence.length})`}>
            {idea.evidence.length === 0 ? (
              <p className="text-sm text-muted">No evidence yet. Without it, the AI won&apos;t recommend building now.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {idea.evidence.map((e) => {
                  const Icon = EVIDENCE_ICON[e.kind];
                  return (
                    <li key={e.id} className="flex gap-3 rounded-xl bg-field p-3">
                      <Icon size={15} aria-hidden className="mt-0.5 shrink-0 text-muted" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm whitespace-pre-line">{e.kind === "LINK" && /^https?:\/\//.test(e.content) ? <a className="link break-all" href={e.content} target="_blank" rel="noreferrer">{e.content}</a> : e.content}</p>
                        {e.source && <p className="mt-0.5 text-[11px] text-muted">{e.source}</p>}
                      </div>
                      {contributor && (
                        <ActionButton action={deleteEvidence.bind(null, e.id)} className="btn-ghost btn-sm h-7 text-bad" showResult={false} confirm="Remove this evidence?">
                          <Trash2 size={12} aria-label="Remove evidence" />
                        </ActionButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {(contributor || mine) && (
              <ActionForm action={addEvidence} submit="Add evidence" reset submitClass="btn-quiet btn-sm" className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[140px_1fr]">
                <input type="hidden" name="ideaId" value={idea.id} />
                <select name="kind" className="field" aria-label="Kind of evidence">
                  <option value="QUOTE">Customer quote</option>
                  <option value="METRIC">Metric / data</option>
                  <option value="LINK">Link</option>
                  <option value="NOTE">Note</option>
                </select>
                <textarea name="content" className="field min-h-10" required placeholder="Paste the quote, number or link" aria-label="Evidence" />
                <input name="source" className="field sm:col-start-2" placeholder="Source (optional): who, where, when" aria-label="Evidence source" />
              </ActionForm>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-6">
          <Section title="Effort">
            {idea.effort ? (
              <p className="text-sm">
                <b>{EFFORT[idea.effort]}</b>
                {idea.effortBy && <span className="text-muted"> · by {idea.effortBy.name}</span>}
                {idea.effortNote && <span className="mt-1 block text-xs text-muted">{idea.effortNote}</span>}
              </p>
            ) : (
              <p className="text-sm text-muted">Not estimated. Design or engineering should size it.</p>
            )}
            {contributor && (
              <ActionForm action={setEffort} submit="Save estimate" submitClass="btn-quiet btn-sm" className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="id" value={idea.id} />
                <select name="effort" className="field" defaultValue={idea.effort ?? ""} aria-label="Effort" required>
                  <option value="" disabled>Pick a size</option>
                  {Object.entries(EFFORT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input name="effortNote" className="field" defaultValue={idea.effortNote ?? ""} placeholder="Note (optional)" aria-label="Effort note" />
              </ActionForm>
            )}
          </Section>

          {editor && idea.status !== "APPROVED" && (
            <Section title="Decide">
              <ActionForm action={decide} submit="Record decision" pending="Recording…" className="flex flex-col gap-3">
                <input type="hidden" name="ideaId" value={idea.id} />
                <fieldset className="grid grid-cols-2 gap-2">
                  <legend className="label">Decision</legend>
                  {(["APPROVED", "EXPLORING", "DEFERRED", "REJECTED"] as const).map((o) => (
                    <label key={o} className={`flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-xs font-bold has-[:checked]:border-ink has-[:checked]:bg-field ${o === "APPROVED" && ctx.role !== "ADMIN" ? "opacity-50" : ""}`}>
                      <input type="radio" name="outcome" value={o} required disabled={o === "APPROVED" && ctx.role !== "ADMIN"} defaultChecked={ev ? (ev.recommendation === "BUILD_NOW" ? o === "APPROVED" && ctx.role === "ADMIN" : ev.recommendation === "EXPLORE" ? o === "EXPLORING" : ev.recommendation === "DEFER" ? o === "DEFERRED" : o === "REJECTED") : false} />
                      {o === "APPROVED" ? "Approve" : OUTCOME[o].label}
                    </label>
                  ))}
                </fieldset>
                {ctx.role !== "ADMIN" && <p className="hint -mt-1">Only admins can approve onto the roadmap.</p>}
                <div>
                  <label className="label" htmlFor="reason">Why</label>
                  <textarea id="reason" name="reason" className="field min-h-20" required placeholder={ev ? `AI: ${ev.rationale.slice(0, 120)}…` : "The reason people will read later"} />
                </div>
                {objectives.length > 0 && (
                  <fieldset>
                    <legend className="label">Serves objectives</legend>
                    <div className="flex flex-col gap-1.5">
                      {objectives.map((o) => (
                        <label key={o.id} className="flex items-start gap-2 text-xs">
                          <input type="checkbox" name="objectiveIds" value={o.id} defaultChecked={linked.has(o.id)} className="mt-0.5" />
                          {o.title}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="label" htmlFor="horizon">If approved</label>
                    <select id="horizon" name="horizon" className="field" defaultValue="NEXT">
                      <option value="NOW">Now</option>
                      <option value="NEXT">Next</option>
                      <option value="LATER">Later</option>
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="deferUntil">If deferred, until</label>
                    <input id="deferUntil" name="deferUntil" type="date" className="field" />
                  </div>
                </div>
              </ActionForm>
            </Section>
          )}

          <Section title="Decision history">
            {idea.decisions.length === 0 ? (
              <p className="text-sm text-muted">No decisions yet.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {idea.decisions.map((d) => (
                  <li key={d.id} className="flex gap-2.5">
                    <Avatar name={d.decidedBy.name} size={26} />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-xs">
                        <b>{d.decidedBy.name}</b> <Chip tone={OUTCOME[d.outcome].tone}>{OUTCOME[d.outcome].label}</Chip>
                      </p>
                      <p className="mt-1 text-xs text-ink-2">{d.reason}</p>
                      <p className="mt-1 text-[11px] text-subtle">
                        {fmtDate(d.createdAt)} · AI said {d.aiRecommendation ? RECOMMENDATION[d.aiRecommendation].label.toLowerCase() : "nothing (not evaluated)"} · strategy v{d.strategyVersion}
                        {d.deferUntil ? ` · deferred until ${fmtDate(d.deferUntil)}` : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Section>

          {idea.initiative && (
            <Link href={`/app/initiatives/${idea.initiative.id}`} className="btn-primary self-start">
              Open initiative <ArrowUpRight size={13} aria-hidden />
            </Link>
          )}
        </aside>
      </div>
    </>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[11px] font-semibold text-muted">{label}</span>
      <span className="text-2xl font-extrabold tabular-nums">{value}<span className="text-sm text-subtle">/100</span></span>
    </div>
  );
}
