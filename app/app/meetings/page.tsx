import Link from "next/link";
import { Plus, Upload, ClipboardPaste, Video } from "lucide-react";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { atLeast } from "@/lib/roles";
import { fmtDate, fmtShort } from "@/lib/format";
import { PageHeader, Section, Chip, Empty } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { resolveItem } from "@/app/actions/meetings";
import type { MeetingNotes } from "@/lib/meetings";

export const metadata = { title: "Meetings" };

const STATUS = { CAPTURING: { label: "Capturing", tone: "amber" }, PROCESSING: { label: "Writing notes", tone: "blue" }, READY: { label: "Notes ready", tone: "green" }, FAILED: { label: "Failed", tone: "red" } } as const;
const lagosDay = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10);
const time = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(11, 16);

export default async function MeetingsPage({ searchParams }: PageProps<"/app/meetings">) {
  const ctx = await getCtx();
  const sp = await searchParams;
  const tab = sp.log === "decisions" ? "decisions" : "blockers";
  const [meetings, blockers, decisions, pending] = await Promise.all([
    prisma.meeting.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { date: "desc" }, take: 60, select: { id: true, title: true, date: true, status: true, attendees: true, notes: true, _count: { select: { tasks: true } } } }),
    prisma.meetingItem.findMany({ where: { workspaceId: ctx.workspace.id, kind: "BLOCKER" }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 40, include: { meeting: { select: { id: true, title: true, date: true } } } }),
    prisma.meetingItem.findMany({ where: { workspaceId: ctx.workspace.id, kind: { in: ["DECISION", "REQUEST"] } }, orderBy: { createdAt: "desc" }, take: 40, include: { meeting: { select: { id: true, title: true, date: true } } } }),
    prisma.draft.findMany({ where: { workspaceId: ctx.workspace.id, kind: "MEETING_ACTIONS", status: "PENDING" }, select: { targetId: true } }),
  ]);
  const pendingIds = new Set(pending.map((p) => p.targetId));
  const days = [...new Set(meetings.map((m) => lagosDay(m.date)))];
  const canEdit = atLeast(ctx.role, "CONTRIBUTOR");
  const openBlockers = blockers.filter((b) => b.status === "OPEN");

  return (
    <>
      <PageHeader crumbs={["Planning", "Meetings"]} title="Meetings" lead="Record standups and check-ins. Notes come out in your format, and the updates they imply wait for your approval.">
        {canEdit && (
          <>
            <Link href="/app/meetings/new?source=paste" className="btn-quiet btn-sm"><ClipboardPaste size={13} aria-hidden /> Paste transcript</Link>
            <Link href="/app/meetings/new?source=upload" className="btn-quiet btn-sm"><Upload size={13} aria-hidden /> Upload</Link>
            <Link href="/app/meetings/new" className="btn-quiet btn-sm"><Plus size={14} aria-hidden /> Record or add</Link>
            <Link href="/app/meetings/new?source=call" className="btn-primary btn-sm"><Video size={14} aria-hidden /> Start a call</Link>
          </>
        )}
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-6">
          {meetings.length === 0 ? (
            <Empty title="No meetings yet" action={canEdit && <Link href="/app/meetings/new" className="btn-primary btn-sm">Record your first standup</Link>}>
              Start a call here, record a Google Meet tab, upload a recording or paste a transcript. You get notes by workstream, decisions, blockers and next actions, plus proposed task and status updates.
            </Empty>
          ) : (
            days.map((day) => (
              <Section key={day} title={fmtDate(new Date(`${day}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", year: "numeric" })} action={<Link href={`/app/meetings/day/${day}`} className="btn-quiet btn-sm">Day view</Link>}>
                <ul className="flex flex-col divide-y divide-line">
                  {meetings
                    .filter((m) => lagosDay(m.date) === day)
                    .map((m) => {
                      const n = m.notes as MeetingNotes | null;
                      return (
                        <li key={m.id} className="py-3">
                          <Link href={`/app/meetings/${m.id}`} className="group flex flex-col gap-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs text-muted">{time(m.date)}</span>
                              <span className="text-sm font-extrabold group-hover:underline">{m.title}</span>
                              <Chip tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Chip>
                              {pendingIds.has(m.id) && <Chip tone="blue" dot={false}>Updates to review</Chip>}
                            </span>
                            {n?.summary?.[0] && <span className="line-clamp-2 text-sm text-ink-2">{n.summary[0]}</span>}
                            <span className="text-[11px] text-muted">
                              {m.attendees.length ? `${m.attendees.length} attending` : ""}
                              {n ? ` · ${n.decisions.length} decision${n.decisions.length === 1 ? "" : "s"} · ${n.blockers.length} blocker${n.blockers.length === 1 ? "" : "s"}` : ""}
                              {m._count.tasks ? ` · ${m._count.tasks} task${m._count.tasks === 1 ? "" : "s"}` : ""}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                </ul>
              </Section>
            ))
          )}
        </div>

        <Section
          title="Log"
          action={
            <div className="flex gap-1">
              <Link href="/app/meetings" className={tab === "blockers" ? "btn-primary btn-sm" : "btn-quiet btn-sm"}>Blockers ({openBlockers.length})</Link>
              <Link href="/app/meetings?log=decisions" className={tab === "decisions" ? "btn-primary btn-sm" : "btn-quiet btn-sm"}>Decisions</Link>
            </div>
          }
        >
          {tab === "blockers" ? (
            blockers.length === 0 ? (
              <p className="text-sm text-muted">Blockers you approve from meeting notes are tracked here until they’re cleared.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {blockers.map((b) => (
                  <li key={b.id} className="flex flex-col gap-1.5 py-3">
                    <p className={`text-sm ${b.status === "RESOLVED" ? "text-muted line-through" : "font-semibold"}`}>{b.text}</p>
                    <p className="text-[11px] text-muted">
                      {b.owner ? `${b.owner} · ` : ""}
                      <Link href={`/app/meetings/${b.meeting.id}`} className="hover:underline">{b.meeting.title}, {fmtShort(b.meeting.date)}</Link>
                      {b.resolvedNote ? ` · ${b.resolvedNote}` : ""}
                    </p>
                    {canEdit && (
                      <ActionForm action={resolveItem.bind(null, b.id)} submit={b.status === "OPEN" ? "Mark cleared" : "Reopen"} pending="Saving…" submitClass="btn-quiet btn-sm" className="flex flex-wrap items-center gap-2">
                        {b.status === "OPEN" && <input name="note" className="field h-8 max-w-[220px] text-xs" placeholder="How it was cleared (optional)" />}
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )
          ) : decisions.length === 0 ? (
            <p className="text-sm text-muted">Decisions and requests you approve from meeting notes are kept here.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {decisions.map((d) => (
                <li key={d.id} className="flex flex-col gap-1 py-3 text-sm">
                  <span>
                    <Chip tone={d.kind === "DECISION" ? "green" : "blue"} dot={false}>{d.kind === "DECISION" ? "Decision" : "Request"}</Chip> {d.text}
                  </span>
                  <Link href={`/app/meetings/${d.meeting.id}`} className="text-[11px] text-muted hover:underline">{d.meeting.title}, {fmtShort(d.meeting.date)}</Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
