import Link from "next/link";
import { notFound } from "next/navigation";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { atLeast } from "@/lib/roles";
import { fmtDate } from "@/lib/format";
import { notesMarkdown, type MeetingNotes, type MeetingProposals } from "@/lib/meetings";
import { PageHeader, Section, Chip, Notice } from "@/components/ui";
import { ActionButton, ActionForm } from "@/components/forms";
import CopyButton from "@/components/CopyButton";
import Capture from "@/components/meetings/Capture";
import NotesView from "@/components/meetings/NotesView";
import MeetingReview from "@/components/meetings/MeetingReview";
import { finishMeeting, rewriteNotes, deleteMeeting, updateMeeting } from "@/app/actions/meetings";
import { WORK_STATUS } from "@/lib/labels";

export async function generateMetadata({ params }: PageProps<"/app/meetings/[id]">) {
  const m = await prisma.meeting.findUnique({ where: { id: (await params).id }, select: { title: true } });
  return { title: m?.title ?? "Meeting" };
}

const time = (d: Date) => new Date(d.getTime() + 60 * 60_000).toISOString().slice(11, 16);

export default async function MeetingPage({ params, searchParams }: PageProps<"/app/meetings/[id]">) {
  const ctx = await getCtx();
  const { id } = await params;
  const sp = await searchParams;
  const meeting = await prisma.meeting.findFirst({
    where: { id, workspaceId: ctx.workspace.id },
    include: {
      segments: { orderBy: { index: "asc" } },
      items: { orderBy: { createdAt: "asc" } },
      tasks: { include: { owner: { select: { name: true } } }, orderBy: { createdAt: "asc" } },
      createdBy: { select: { name: true } },
    },
  });
  if (!meeting) notFound();
  const draft = await prisma.draft.findFirst({ where: { workspaceId: ctx.workspace.id, kind: "MEETING_ACTIONS", targetId: meeting.id }, orderBy: { createdAt: "desc" } });
  const canEdit = atLeast(ctx.role, "CONTRIBUTOR");
  const canApprove = atLeast(ctx.role, "EDITOR");
  const notes = meeting.notes as MeetingNotes | null;
  const hasNotes = !!notes && meeting.status === "READY";
  const capturing = !hasNotes || sp.add === "1";

  return (
    <>
      <PageHeader
        crumbs={["Planning", "Meetings", fmtDate(meeting.date)]}
        title={meeting.title}
        lead={
          <>
            {fmtDate(meeting.date, { weekday: "long", day: "numeric", month: "long" })} at {time(meeting.date)}
            {meeting.durationSec ? ` · ${Math.round(meeting.durationSec / 60)} min` : ""}
            {meeting.attendees.length ? ` · ${meeting.attendees.join(", ")}` : ""}
          </>
        }
      >
        {hasNotes && <CopyButton text={notesMarkdown({ ...meeting, notes })} label="Copy notes" />}
        <Link href={`/app/meetings/day/${new Date(meeting.date.getTime() + 3_600_000).toISOString().slice(0, 10)}`} className="btn-quiet btn-sm">Day view</Link>
      </PageHeader>

      {meeting.status === "FAILED" && <Notice tone="red">The notes couldn’t be written: {meeting.error ?? "unknown error"}. Try again below.</Notice>}
      {meeting.status === "PROCESSING" && <Notice tone="blue">Writing the notes… refresh in a moment.</Notice>}

      <div className="mt-2 grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-6">
          {capturing && canEdit && (
            <Section title={hasNotes ? "Add to the recording" : "Capture the meeting"}>
              <Capture meetingId={meeting.id} existing={meeting.segments} finish={finishMeeting.bind(null, meeting.id)} initialMode={(meeting.source as "record" | "upload" | "paste") ?? "record"} />
            </Section>
          )}

          {hasNotes && (
            <Section
              title="Notes"
              action={
                canEdit && (
                  <div className="flex gap-2">
                    <Link href={`/app/meetings/${meeting.id}?add=1`} className="btn-quiet btn-sm">Add audio</Link>
                    <ActionButton action={rewriteNotes.bind(null, meeting.id)} className="btn-quiet btn-sm" pending="Rewriting…">Rewrite</ActionButton>
                  </div>
                )
              }
            >
              <NotesView n={notes!} />
            </Section>
          )}

          {meeting.transcript && (
            <Section title="Transcript">
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-accent">Show the transcript ({meeting.transcript.split(/\s+/).length.toLocaleString()} words)</summary>
                <pre className="mt-3 max-h-[480px] overflow-auto whitespace-pre-wrap rounded-xl bg-field p-3 font-mono text-xs leading-relaxed">{meeting.transcript}</pre>
              </details>
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {draft?.status === "PENDING" && (
            <Section title="Proposed updates">
              <p className="mb-4 text-sm text-muted">What the call implies for tasks, the roadmap and OKRs. Untick anything that’s wrong, then apply.</p>
              <MeetingReview id={draft.id} c={draft.content as unknown as MeetingProposals} canApprove={canApprove} />
            </Section>
          )}
          {draft && draft.status !== "PENDING" && (
            <Notice tone={draft.status === "APPROVED" ? "green" : "grey"}>
              Updates {draft.status === "APPROVED" ? "applied" : "dismissed"}
              {draft.reviewNote ? `: ${draft.reviewNote}` : "."}
            </Notice>
          )}

          {meeting.tasks.length > 0 && (
            <Section title={`Tasks from this meeting (${meeting.tasks.length})`}>
              <ul className="flex flex-col divide-y divide-line">
                {meeting.tasks.map((t) => (
                  <li key={t.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                    <span className={t.status === "DONE" ? "text-muted line-through" : ""}>
                      {t.title}
                      <span className="block text-[11px] text-muted">{t.owner?.name ?? t.ownerName ?? "No owner"}</span>
                    </span>
                    <Chip tone={WORK_STATUS[t.status].tone}>{WORK_STATUS[t.status].label}</Chip>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {meeting.items.length > 0 && (
            <Section title="Logged">
              <ul className="flex flex-col gap-2 text-sm">
                {meeting.items.map((it) => (
                  <li key={it.id} className="flex gap-2">
                    <Chip tone={it.kind === "BLOCKER" ? (it.status === "OPEN" ? "red" : "grey") : it.kind === "DECISION" ? "green" : "blue"} dot={false}>
                      {it.kind === "BLOCKER" ? (it.status === "OPEN" ? "Blocker" : "Cleared") : it.kind === "DECISION" ? "Decision" : "Request"}
                    </Chip>
                    <span className="min-w-0 flex-1">{it.text}</span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {canEdit && (
            <Section title="Details">
              <ActionForm action={updateMeeting.bind(null, meeting.id)} className="flex flex-col gap-3">
                <input name="title" className="field" defaultValue={meeting.title} aria-label="Name" />
                <textarea name="attendees" rows={2} className="field" defaultValue={meeting.attendees.join(", ")} aria-label="Attendees" />
              </ActionForm>
              {canApprove && (
                <div className="mt-4 border-t border-line pt-4">
                  <ActionButton action={deleteMeeting.bind(null, meeting.id)} className="btn-danger btn-sm" pending="Deleting…" confirm="Delete this meeting, its recording transcript and notes? Tasks it created stay.">
                    Delete meeting
                  </ActionButton>
                </div>
              )}
              <p className="hint mt-3">Started by {meeting.createdBy.name}. Audio isn’t stored; only the transcript and notes are kept.</p>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
