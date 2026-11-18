import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2, Sparkles, Plus, Check, AlertTriangle, Lightbulb } from "lucide-react";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { atLeast } from "@/lib/roles";
import { HORIZON, WORK_STATUS } from "@/lib/labels";
import { riskReasons } from "@/lib/command";
import { fmtDate, fmtShort } from "@/lib/format";
import { PageHeader, Section, Chip, Avatar, Progress, Notice } from "@/components/ui";
import { ActionForm, ActionButton, AutoSelect } from "@/components/forms";
import Markdown from "@/components/Markdown";
import InitiativeFields from "@/components/app/InitiativeFields";
import { updateInitiative, setInitiativeStatus, deleteInitiative, saveMilestone, setMilestoneStatus, deleteMilestone, saveTask, toggleTask, deleteTask, savePrd } from "@/app/actions/planning";
import { startPrdAgent } from "@/app/actions/agents";

export const metadata = { title: "Initiative" };

const STATUS_OPTIONS = Object.entries(WORK_STATUS).map(([value, v]) => ({ value, label: v.label }));

export default async function InitiativePage({ params }: PageProps<"/app/initiatives/[id]">) {
  const ctx = await getCtx();
  const { id } = await params;
  const i = await prisma.initiative.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: {
      owner: { select: { id: true, name: true } },
      product: { select: { id: true, name: true } },
      idea: { select: { id: true, title: true } },
      objectives: { include: { objective: { select: { id: true, title: true, status: true } } } },
      milestones: { orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], include: { owner: { select: { name: true } } } },
      tasks: { orderBy: [{ status: "asc" }, { createdAt: "asc" }], include: { owner: { select: { name: true } } } },
    },
  });
  if (!i) notFound();
  const [products, objectives, members, prdDraft] = await Promise.all([
    prisma.product.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
    prisma.objective.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, title: true }, orderBy: { createdAt: "asc" } }),
    prisma.member.findMany({ where: { organisationId: ctx.org.id }, select: { user: { select: { id: true, name: true } } } }),
    prisma.draft.findFirst({ where: { workspaceId: ctx.workspace.id, kind: "PRD", targetId: id, status: "PENDING" }, select: { id: true } }),
  ]);
  const team = members.map((m) => m.user);
  const editor = atLeast(ctx.role, "EDITOR");
  const contributor = atLeast(ctx.role, "CONTRIBUTOR");
  const risks = riskReasons(i);
  const all = [...i.milestones, ...i.tasks];
  const progress = i.status === "DONE" ? 100 : all.length ? Math.round((all.filter((x) => x.status === "DONE").length / all.length) * 100) : 0;
  const now = new Date();

  return (
    <>
      <PageHeader
        crumbs={["Planning", "Roadmap", HORIZON[i.horizon]]}
        title={i.title}
        lead={
          <>
            {i.product?.name ?? "No product"} · {i.owner ? `owned by ${i.owner.name}` : "no owner"}
            {i.startDate || i.endDate ? ` · ${fmtDate(i.startDate) || "?"} to ${fmtDate(i.endDate) || "?"}` : ""}
          </>
        }
      >
        <Chip tone={WORK_STATUS[i.status].tone}>{WORK_STATUS[i.status].label}</Chip>
        <Chip dot={false}>{HORIZON[i.horizon]}</Chip>
      </PageHeader>

      {risks.length > 0 && (
        <Notice tone="amber">
          <span className="inline-flex items-center gap-1.5 font-bold"><AlertTriangle size={14} aria-hidden /> Needs attention:</span> {risks.join(" · ")}
        </Notice>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Section title="Overview">
            <div className="flex flex-col gap-4">
              <Progress value={progress} label="Progress" />
              {i.description && <p className="text-sm whitespace-pre-line text-ink-2">{i.description}</p>}
              <div>
                <p className="eyebrow mb-1.5 text-[10px]">Serves</p>
                {i.objectives.length === 0 ? (
                  <p className="text-xs font-semibold text-warn">No objective. Link one below so this work counts towards the strategy.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {i.objectives.map((o) => (
                      <Link key={o.objectiveId} href={`/app/strategy#o-${o.objectiveId}`} className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold text-accent-ink hover:underline">
                        {o.objective.title}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
              {i.idea && (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Lightbulb size={13} aria-hidden /> From the idea <Link className="link" href={`/app/ideas/${i.idea.id}`}>{i.idea.title}</Link>
                </p>
              )}
            </div>
            {editor && (
              <details className="mt-4 border-t border-line pt-3">
                <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-accent"><Pencil size={12} aria-hidden /> Edit initiative</summary>
                <ActionForm action={updateInitiative} className="mt-3 grid gap-3 sm:grid-cols-2">
                  <InitiativeFields products={products} objectives={objectives} members={team} i={{ ...i, objectiveIds: i.objectives.map((o) => o.objectiveId) }} />
                </ActionForm>
                {ctx.role === "ADMIN" && (
                  <div className="mt-3">
                    <ActionButton action={deleteInitiative.bind(null, i.id)} className="btn-danger btn-sm" confirm={`Remove "${i.title}" from the roadmap? Its milestones and tasks go too.`}>
                      <Trash2 size={13} aria-hidden /> Delete initiative
                    </ActionButton>
                  </div>
                )}
              </details>
            )}
          </Section>

          <Section title={`Milestones (${i.milestones.length})`}>
            {i.milestones.length === 0 && <p className="text-sm text-muted">No milestones yet.</p>}
            <ul className="flex flex-col gap-2">
              {i.milestones.map((m) => {
                const late = m.status !== "DONE" && m.dueDate && m.dueDate < now;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3">
                    <span aria-hidden className={`size-2.5 rotate-45 ${m.status === "DONE" ? "bg-good" : late ? "bg-bad" : "bg-ink"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{m.title}</p>
                      <p className={`text-[11px] ${late ? "font-semibold text-bad" : "text-muted"}`}>
                        {m.dueDate ? `${late ? "Overdue · was due" : "Due"} ${fmtDate(m.dueDate)}` : "No date"}
                        {m.owner ? ` · ${m.owner.name}` : ""}
                      </p>
                    </div>
                    {contributor ? (
                      <AutoSelect action={setMilestoneStatus.bind(null, m.id)} name="status" label={`${m.title} status`} value={m.status} options={STATUS_OPTIONS} />
                    ) : (
                      <Chip tone={WORK_STATUS[m.status].tone}>{WORK_STATUS[m.status].label}</Chip>
                    )}
                    {editor && (
                      <ActionButton action={deleteMilestone.bind(null, m.id)} className="btn-ghost btn-sm text-bad" showResult={false} confirm={`Delete the milestone "${m.title}"?`}>
                        <Trash2 size={12} aria-label="Delete milestone" />
                      </ActionButton>
                    )}
                  </li>
                );
              })}
            </ul>
            {contributor && (
              <details className="mt-3">
                <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-accent"><Plus size={12} aria-hidden /> Add a milestone</summary>
                <ActionForm action={saveMilestone} submit="Add milestone" reset submitClass="btn-quiet btn-sm" className="mt-3 grid gap-2 sm:grid-cols-[1fr_150px_160px]">
                  <input type="hidden" name="initiativeId" value={i.id} />
                  <input name="title" className="field" required placeholder="e.g. Beta with 50 students" aria-label="Milestone" />
                  <input name="dueDate" type="date" className="field" aria-label="Due date" />
                  <select name="ownerId" className="field" aria-label="Owner" defaultValue="">
                    <option value="">No owner</option>
                    {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </ActionForm>
              </details>
            )}
          </Section>

          <Section title={`Tasks (${i.tasks.filter((t) => t.status === "DONE").length}/${i.tasks.length} done)`}>
            {i.tasks.length === 0 && <p className="text-sm text-muted">No tasks yet. Keep them basic here; detailed engineering work lives in Jira or Linear.</p>}
            <ul className="flex flex-col divide-y divide-line">
              {i.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5">
                  {contributor ? (
                    <ActionButton action={toggleTask.bind(null, t.id)} className={`flex size-5 shrink-0 items-center justify-center rounded-md border ${t.status === "DONE" ? "border-good bg-good text-white" : "border-line-2 bg-card"}`} showResult={false} pending="">
                      {t.status === "DONE" ? <Check size={12} aria-label="Mark not done" /> : <span className="sr-only">Mark done</span>}
                    </ActionButton>
                  ) : (
                    <span className={`size-5 rounded-md border ${t.status === "DONE" ? "border-good bg-good" : "border-line-2"}`} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${t.status === "DONE" ? "text-muted line-through" : "font-semibold"}`}>{t.title}</p>
                    <p className="text-[11px] text-muted">
                      {t.owner?.name ?? "Unassigned"}
                      {t.dueDate ? ` · due ${fmtShort(t.dueDate)}` : ""}
                      {t.milestoneId ? ` · ${i.milestones.find((m) => m.id === t.milestoneId)?.title ?? ""}` : ""}
                    </p>
                  </div>
                  {contributor && (
                    <ActionButton action={deleteTask.bind(null, t.id)} className="btn-ghost btn-sm text-subtle hover:text-bad" showResult={false}>
                      <Trash2 size={12} aria-label="Delete task" />
                    </ActionButton>
                  )}
                </li>
              ))}
            </ul>
            {contributor && (
              <ActionForm action={saveTask} submit="Add task" reset submitClass="btn-quiet btn-sm" className="mt-3 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_140px_140px]">
                <input type="hidden" name="initiativeId" value={i.id} />
                <input name="title" className="field sm:col-span-3" required placeholder="Add a task" aria-label="Task" />
                <select name="ownerId" className="field" aria-label="Owner" defaultValue="">
                  <option value="">Unassigned</option>
                  {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <input name="dueDate" type="date" className="field" aria-label="Due date" />
                <select name="milestoneId" className="field" aria-label="Milestone" defaultValue="">
                  <option value="">No milestone</option>
                  {i.milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </ActionForm>
            )}
          </Section>

          <Section
            title="PRD"
            action={
              editor ? (
                prdDraft ? (
                  <Link href={`/app/agents/drafts/${prdDraft.id}`} className="btn-accent btn-sm">Review the PRD draft</Link>
                ) : (
                  <ActionButton action={startPrdAgent.bind(null, i.id)} className="btn-quiet btn-sm" pending="Drafting…">
                    <Sparkles size={13} aria-hidden /> {i.prd ? "Redraft with PRD Agent" : "Draft with PRD Agent"}
                  </ActionButton>
                )
              ) : undefined
            }
          >
            {i.prd ? <Markdown text={i.prd} /> : <p className="text-sm text-muted">No PRD yet. The PRD Agent drafts one from the idea, evidence and objectives; you edit and approve it.</p>}
            {editor && (
              <details className="mt-4 border-t border-line pt-3">
                <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-accent"><Pencil size={12} aria-hidden /> {i.prd ? "Edit PRD" : "Write it yourself"}</summary>
                <ActionForm action={savePrd} submit="Save PRD" className="mt-3 flex flex-col gap-3">
                  <input type="hidden" name="id" value={i.id} />
                  <textarea name="prd" className="field min-h-80 font-mono text-xs" defaultValue={i.prd ?? ""} aria-label="PRD (markdown)" />
                </ActionForm>
              </details>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-6">
          <Section title="Status">
            {contributor ? (
              <ActionForm action={setInitiativeStatus} submit="Update status" className="flex flex-col gap-3">
                <input type="hidden" name="id" value={i.id} />
                <select name="status" className="field" defaultValue={i.status} aria-label="Status">
                  {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <textarea name="note" className="field min-h-16" defaultValue={i.statusNote ?? ""} placeholder="Required for At risk or Blocked: what's wrong and what's needed" aria-label="Status note" />
              </ActionForm>
            ) : (
              <p className="text-sm">{WORK_STATUS[i.status].label}{i.statusNote ? `: ${i.statusNote}` : ""}</p>
            )}
          </Section>
          <Section title="People">
            <ul className="flex flex-col gap-2">
              {[...new Map([i.owner, ...i.milestones.map((m) => m.owner), ...i.tasks.map((t) => t.owner)].filter(Boolean).map((u) => [u!.name, u!])).values()].map((u) => (
                <li key={u.name} className="flex items-center gap-2 text-sm">
                  <Avatar name={u.name} size={26} /> {u.name} {u.name === i.owner?.name && <span className="text-xs text-muted">· owner</span>}
                </li>
              ))}
              {!i.owner && i.tasks.every((t) => !t.owner) && <li className="text-sm text-muted">Nobody assigned yet.</li>}
            </ul>
          </Section>
        </aside>
      </div>
    </>
  );
}
