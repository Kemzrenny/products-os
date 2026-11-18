import Link from "next/link";
import { notFound } from "next/navigation";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { atLeast } from "@/lib/roles";
import { callsConfigured } from "@/lib/livekit";
import { PageHeader, Notice } from "@/components/ui";
import CallRoom from "@/components/meetings/CallRoom";
import CopyButton from "@/components/CopyButton";
import { endCall } from "@/app/actions/meetings";

export const metadata = { title: "Call" };

export default async function CallPage({ params }: PageProps<"/app/meetings/[id]/call">) {
  const ctx = await getCtx();
  const { id } = await params;
  const meeting = await prisma.meeting.findFirst({ where: { id, workspaceId: ctx.workspace.id }, select: { id: true, title: true, callEndedAt: true } });
  if (!meeting) notFound();
  return (
    <>
      <PageHeader crumbs={["Planning", "Meetings", "Call"]} title={meeting.title}>
        <CopyButton text={`/app/meetings/${meeting.id}/call`} label="Copy invite link" />
        <Link href={`/app/meetings/${meeting.id}`} className="btn-quiet btn-sm">Meeting notes</Link>
      </PageHeader>
      {!callsConfigured() ? (
        <Notice tone="amber">
          Calls aren&apos;t set up yet. An admin adds <code>LIVEKIT_URL</code>, <code>LIVEKIT_API_KEY</code> and <code>LIVEKIT_API_SECRET</code> in Vercel (from a LiveKit Cloud project), then redeploys. Until then, record a Google Meet tab from the meeting page.
        </Notice>
      ) : meeting.callEndedAt ? (
        <Notice tone="grey">
          This call has ended. <Link href={`/app/meetings/${meeting.id}`} className="font-semibold underline">Go to the notes</Link>.
        </Notice>
      ) : (
        <CallRoom meetingId={meeting.id} title={meeting.title} endCall={endCall.bind(null, meeting.id)} canEnd={atLeast(ctx.role, "CONTRIBUTOR")} />
      )}
    </>
  );
}
