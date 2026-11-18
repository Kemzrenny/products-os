import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCtx } from "@/lib/context";
import { callsConfigured, joinToken } from "@/lib/livekit";
import { messageFor } from "@/lib/action";

// A token to join the meeting's call. The first person to join starts the call clock,
// which every person's recording is timed against so the transcript lines up.
export async function POST(_: Request, ctx: RouteContext<"/api/meetings/[id]/join">) {
  const { id } = await ctx.params;
  try {
    const c = await requireCtx("VIEWER");
    if (!callsConfigured()) return NextResponse.json({ error: "Calls aren't set up yet. An admin needs to add the LiveKit keys." }, { status: 503 });
    const meeting = await prisma.meeting.findFirst({ where: { id, workspaceId: c.workspace.id } });
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    if (meeting.callEndedAt) return NextResponse.json({ error: "This call has ended." }, { status: 409 });
    const now = new Date();
    const attendees = meeting.attendees.some((a) => a.toLowerCase() === c.user.name.toLowerCase()) ? meeting.attendees : [...meeting.attendees, c.user.name];
    // Only set the start once, even if two people join at the same moment.
    await prisma.meeting.updateMany({ where: { id, callStartedAt: null }, data: { callStartedAt: now } });
    const updated = await prisma.meeting.update({ where: { id }, data: { attendees, source: "call", status: meeting.status === "READY" ? "CAPTURING" : meeting.status } });
    const { url, token } = await joinToken(id, c.user);
    return NextResponse.json({ url, token, callStartedAt: updated.callStartedAt!.getTime(), serverNow: Date.now(), me: { id: c.user.id, name: c.user.name } });
  } catch (err) {
    return NextResponse.json({ error: messageFor(err) }, { status: 500 });
  }
}
