import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCtx } from "@/lib/context";
import { transcribePart } from "@/lib/meetings";
import { messageFor } from "@/lib/action";

export const maxDuration = 120;

const MAX_BYTES = 4_400_000; // Vercel's request limit is 4.5MB

// One part of a recording (about two minutes). The browser sends parts as the call goes
// on, so a long meeting never needs one huge upload, and a failed part can be resent.
export async function POST(req: Request, ctx: RouteContext<"/api/meetings/[id]/segments">) {
  const { id } = await ctx.params;
  try {
    const c = await requireCtx("CONTRIBUTOR");
    const meeting = await prisma.meeting.findFirst({ where: { id, workspaceId: c.workspace.id }, select: { id: true, status: true } });
    if (!meeting) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
    const fd = await req.formData();
    const file = fd.get("audio");
    const index = Number(fd.get("index"));
    const startSec = Number(fd.get("startSec") ?? 0);
    const durationSec = fd.get("durationSec") ? Number(fd.get("durationSec")) : null;
    // In an in-app call each person uploads their own mic, so the track is always the
    // signed-in user; nobody can post audio as someone else.
    const own = fd.get("track") === "self";
    const track = own ? c.user.id : "";
    const speaker = own ? c.user.name : null;
    if (!(file instanceof Blob) || !Number.isInteger(index) || index < 0 || index > 2000) return NextResponse.json({ error: "Bad audio part." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "That part is too large." }, { status: 413 });
    if (file.size < 2000) {
      await prisma.meetingSegment.upsert({
        where: { meetingId_track_index: { meetingId: id, track, index } },
        create: { meetingId: id, track, speaker, index, startSec, durationSec, status: "DONE", text: "" },
        update: { status: "DONE", text: "", error: null },
      });
      return NextResponse.json({ ok: true, text: "" });
    }
    if (meeting.status === "READY") await prisma.meeting.update({ where: { id }, data: { status: "CAPTURING" } });
    const mime = (file.type || "audio/webm").split(";")[0];
    const text = await transcribePart(c, id, { track, speaker, index, startSec, durationSec }, Buffer.from(await file.arrayBuffer()), mime);
    revalidatePath(`/app/meetings/${id}`);
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    return NextResponse.json({ error: messageFor(err) }, { status: 500 });
  }
}
