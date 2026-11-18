import Link from "next/link";
import { Check } from "lucide-react";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { WORK_STATUS } from "@/lib/labels";
import { fmtShort } from "@/lib/format";
import { PageHeader, Section, Chip, Empty } from "@/components/ui";
import { ActionButton, AutoSelect } from "@/components/forms";
import { toggleTask, setMilestoneStatus } from "@/app/actions/planning";
import { atLeast } from "@/lib/roles";

export const metadata = { title: "My tasks" };

const STATUS_OPTIONS = Object.entries(WORK_STATUS).map(([value, v]) => ({ value, label: v.label }));

export default async function TasksPage() {
  const ctx = await getCtx();
  const [tasks, milestones, initiatives] = await Promise.all([
    prisma.task.findMany({
      where: { ownerId: ctx.user.id, OR: [{ initiative: { workspaceId: ctx.workspace.id } }, { meeting: { workspaceId: ctx.workspace.id } }] },
      orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }],
      include: { initiative: { select: { id: true, title: true } }, meeting: { select: { id: true, title: true, date: true } } },
    }),
    prisma.milestone.findMany({
      where: { ownerId: ctx.user.id, initiative: { workspaceId: ctx.workspace.id }, status: { not: "DONE" } },
      orderBy: { dueDate: { sort: "asc", nulls: "last" } },
      include: { initiative: { select: { id: true, title: true } } },
    }),
    prisma.initiative.findMany({ where: { ownerId: ctx.user.id, workspaceId: ctx.workspace.id, status: { not: "DONE" } }, select: { id: true, title: true, status: true, endDate: true } }),
  ]);
  const open = tasks.filter((t) => t.status !== "DONE");
  const done = tasks.filter((t) => t.status === "DONE").slice(0, 10);
  const now = new Date();
  const canEdit = atLeast(ctx.role, "CONTRIBUTOR");

  return (
    <>
      <PageHeader crumbs={["Planning", "My tasks"]} title="My tasks" lead="Everything assigned to you in this workspace." />
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <Section title={`Open tasks (${open.length})`}>
            {open.length === 0 ? (
              <Empty title="Nothing on your plate">Tasks assigned to you on any initiative appear here.</Empty>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {open.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    {canEdit && (
                      <ActionButton action={toggleTask.bind(null, t.id)} className="flex size-5 shrink-0 items-center justify-center rounded-md border border-line-2 bg-card" showResult={false} pending="">
                        <span className="sr-only">Mark done</span>
                      </ActionButton>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{t.title}</p>
                      <p className="text-[11px] text-muted">
                        {t.initiative ? (
                          <Link href={`/app/initiatives/${t.initiative.id}`} className="hover:underline">{t.initiative.title}</Link>
                        ) : t.meeting ? (
                          <Link href={`/app/meetings/${t.meeting.id}`} className="hover:underline">From {t.meeting.title}, {fmtShort(t.meeting.date)}</Link>
                        ) : null}
                        {t.dueDate && <span className={t.dueDate < now ? "font-semibold text-bad" : ""}> · due {fmtShort(t.dueDate)}</span>}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          {done.length > 0 && (
            <Section title="Recently done">
              <ul className="flex flex-col gap-2">
                {done.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 text-sm text-muted">
                    <Check size={14} aria-hidden className="text-good" /> <span className="line-through">{t.title}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>
        <aside className="flex flex-col gap-6">
          <Section title={`My milestones (${milestones.length})`}>
            {milestones.length === 0 ? (
              <p className="text-sm text-muted">None open.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {milestones.map((m) => (
                  <li key={m.id} className="flex flex-col gap-1.5">
                    <p className="text-sm font-bold">{m.title}</p>
                    <p className="text-[11px] text-muted">
                      <Link href={`/app/initiatives/${m.initiative.id}`} className="hover:underline">{m.initiative.title}</Link>
                      {m.dueDate && <span className={m.dueDate < now ? "font-semibold text-bad" : ""}> · {fmtShort(m.dueDate)}</span>}
                    </p>
                    {canEdit && <AutoSelect action={setMilestoneStatus.bind(null, m.id)} name="status" label={`${m.title} status`} value={m.status} options={STATUS_OPTIONS} />}
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title={`Initiatives I own (${initiatives.length})`}>
            <ul className="flex flex-col gap-2">
              {initiatives.length === 0 && <li className="text-sm text-muted">None.</li>}
              {initiatives.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2">
                  <Link href={`/app/initiatives/${i.id}`} className="truncate text-sm font-semibold hover:underline">{i.title}</Link>
                  <Chip tone={WORK_STATUS[i.status].tone}>{WORK_STATUS[i.status].label}</Chip>
                </li>
              ))}
            </ul>
          </Section>
        </aside>
      </div>
    </>
  );
}
