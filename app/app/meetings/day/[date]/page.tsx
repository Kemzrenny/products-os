import Link from "next/link";
import { notFound } from "next/navigation";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import { notesMarkdown, type MeetingNotes } from "@/lib/meetings";
import { PageHeader, Section, Empty } from "@/components/ui";
import CopyButton from "@/components/CopyButton";
import NotesView from "@/components/meetings/NotesView";

export const metadata = { title: "Day notes" };

const time = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(11, 16);
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// One day's meetings, read like the team's daily notes doc.
export default async function DayPage({ params }: PageProps<"/app/meetings/day/[date]">) {
  const ctx = await getCtx();
  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const from = new Date(`${date}T00:00:00+01:00`);
  const to = new Date(from.getTime() + 86_400_000);
  const meetings = await prisma.meeting.findMany({ where: { workspaceId: ctx.workspace.id, date: { gte: from, lt: to } }, orderBy: { date: "asc" } });
  const ready = meetings.filter((m) => m.notes && m.status === "READY");
  const label = fmtDate(new Date(`${date}T12:00:00Z`), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const markdown = [`# ${label}`, ...ready.map((m) => notesMarkdown({ ...m, title: `${time(m.date)} ${m.title}`, notes: m.notes as MeetingNotes }))].join("\n\n");

  return (
    <>
      <PageHeader crumbs={["Planning", "Meetings", "Day"]} title={label} lead={`${meetings.length} meeting${meetings.length === 1 ? "" : "s"}`}>
        <Link href={`/app/meetings/day/${shift(date, -1)}`} className="btn-quiet btn-sm">← Previous day</Link>
        <Link href={`/app/meetings/day/${shift(date, 1)}`} className="btn-quiet btn-sm">Next day →</Link>
        {ready.length > 0 && <CopyButton text={markdown} label="Copy the day" />}
      </PageHeader>
      {meetings.length === 0 ? (
        <Empty title="No meetings this day" />
      ) : (
        <div className="flex max-w-4xl flex-col gap-6">
          {meetings.map((m) => (
            <Section key={m.id} title={<Link href={`/app/meetings/${m.id}`} className="hover:underline">{time(m.date)} · {m.title}</Link>}>
              {m.notes && m.status === "READY" ? <NotesView n={m.notes as MeetingNotes} /> : <p className="text-sm text-muted">No notes yet.</p>}
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
