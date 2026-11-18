import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { PageHeader, Section } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { createMeeting } from "@/app/actions/meetings";

// Lagos is UTC+1 all year.
function lagosNow() {
  return new Date(Date.now() + 60 * 60_000);
}

export const metadata = { title: "New meeting" };

export default async function NewMeetingPage({ searchParams }: PageProps<"/app/meetings/new">) {
  const ctx = await getCtx("CONTRIBUTOR");
  const sp = await searchParams;
  const [members, recent] = await Promise.all([
    prisma.member.findMany({ where: { organisationId: ctx.org.id }, select: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.meeting.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { date: "desc" }, take: 30, select: { series: true, attendees: true } }),
  ]);
  // Repeat meetings start with last time's attendees.
  const series = [...new Map(recent.filter((r) => r.series).map((r) => [r.series!, r.attendees])).entries()];
  const pickedSeries = typeof sp.series === "string" ? sp.series : series[0]?.[0] ?? "";
  const attendees = series.find(([s]) => s === pickedSeries)?.[1] ?? [];
  const now = lagosNow();
  const source = typeof sp.source === "string" ? sp.source : "record";

  return (
    <>
      <PageHeader crumbs={["Planning", "Meetings", "New"]} title="New meeting notes" lead={source === "call" ? "Name the meeting and start the call. Share the link with the team; everyone joins from Products OS." : "Name the meeting, then record it, upload the recording or paste a transcript on the next screen."} />
      <Section title="Meeting" className="max-w-2xl">
        <ActionForm action={createMeeting} submit={source === "call" ? "Start the call" : "Continue"} pending="Creating…">
          <input type="hidden" name="source" value={source} />
          <label className="flex flex-col gap-1.5">
            <span className="label">Name</span>
            <input name="title" className="field" list="series" defaultValue={pickedSeries} placeholder="Products and Engineering standup" required />
            <datalist id="series">
              {series.map(([s]) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <span className="hint">Use the same name each day so the notes can follow up on the last one.</span>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="label">Date</span>
              <input type="date" name="date" className="field" defaultValue={now.toISOString().slice(0, 10)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="label">Time</span>
              <input type="time" name="time" className="field" defaultValue={now.toISOString().slice(11, 16)} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="label">Who’s attending</span>
            <textarea name="attendees" rows={2} className="field" defaultValue={attendees.join(", ")} placeholder={members.map((m) => m.user.name).slice(0, 6).join(", ")} />
            <span className="hint">Comma separated. Names help the transcription and the notes attribute updates correctly.</span>
          </label>
        </ActionForm>
      </Section>
    </>
  );
}
