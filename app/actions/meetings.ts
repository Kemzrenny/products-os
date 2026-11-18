"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireCtx } from "@/lib/context";
import { attempt, str, need, UserError } from "@/lib/action";
import { audit } from "@/lib/audit";
import { writeNotes } from "@/lib/meetings";
import type { Result } from "@/lib/result";

function refresh(id?: string) {
  revalidatePath("/app/meetings", "layout");
  revalidatePath("/app");
  revalidatePath("/app/agents");
  if (id) revalidatePath(`/app/meetings/${id}`);
}

const names = (v: string) => [...new Set(v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))].slice(0, 40);

export async function createMeeting(_: Result, fd: FormData): Promise<Result> {
  let id = "";
  const res = await attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const title = need(str(fd, "title"), "Give the meeting a name, like “Products and Engineering standup”.");
    const date = str(fd, "date") ? new Date(`${str(fd, "date")}T${str(fd, "time") || "09:00"}:00+01:00`) : new Date();
    if (Number.isNaN(date.getTime())) throw new UserError("That date doesn't look right.");
    const source = ["record", "upload", "paste"].includes(str(fd, "source")) ? str(fd, "source") : "record";
    const m = await prisma.meeting.create({
      data: { workspaceId: ctx.workspace.id, title, series: title, date, attendees: names(str(fd, "attendees")), source, status: "CAPTURING", createdById: ctx.user.id },
    });
    id = m.id;
    await audit(ctx, "meeting.created", "meeting", m.id, `Started notes for "${title}"`);
  });
  if (res?.error) return res;
  refresh();
  redirect(`/app/meetings/${id}`);
}

// Joins the transcribed parts (or takes a pasted transcript) and writes the notes.
export async function finishMeeting(meetingId: string, _: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const meeting = await prisma.meeting.findFirstOrThrow({ where: { id: meetingId, workspaceId: ctx.workspace.id }, include: { segments: { orderBy: { index: "asc" } } } });
    const pasted = str(fd, "transcript");
    let transcript = pasted;
    if (!pasted) {
      if (meeting.segments.some((s) => s.status === "PENDING")) throw new UserError("Some parts are still being transcribed. Wait a moment and try again.");
      const failed = meeting.segments.filter((s) => s.status === "FAILED");
      if (failed.length && fd.get("skipFailed") !== "on") throw new UserError(`${failed.length} part${failed.length === 1 ? "" : "s"} couldn't be transcribed. Retry them, or tick “Write notes without them”.`);
      transcript = meeting.segments
        .filter((s) => s.status === "DONE" && s.text)
        .map((s) => `[${Math.floor(s.startSec / 60)}:${String(Math.round(s.startSec % 60)).padStart(2, "0")}]\n${s.text}`)
        .join("\n\n");
    }
    if (!transcript.trim()) throw new UserError(pasted ? "The transcript is empty." : "Nothing was transcribed yet. Record or upload the call first, or paste a transcript.");
    const durationSec = meeting.segments.reduce((max, s) => Math.max(max, s.startSec + (s.durationSec ?? 0)), 0) || null;
    await prisma.meeting.update({ where: { id: meetingId }, data: { transcript, status: "PROCESSING", error: null, durationSec: pasted ? meeting.durationSec : durationSec, source: pasted && meeting.segments.length === 0 ? "paste" : meeting.source } });
    await writeNotes(ctx, meetingId);
    await audit(ctx, "meeting.notes", "meeting", meetingId, `Wrote the notes for "${meeting.title}"`);
    refresh(meetingId);
    return "Notes written. Review the proposed updates below.";
  });
}

export async function rewriteNotes(meetingId: string): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    await prisma.meeting.update({ where: { id: meetingId, workspaceId: ctx.workspace.id }, data: { status: "PROCESSING" } });
    await writeNotes(ctx, meetingId);
    refresh(meetingId);
    return "Notes rewritten.";
  });
}

export async function updateMeeting(meetingId: string, _: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const title = need(str(fd, "title"), "The meeting needs a name.");
    await prisma.meeting.update({ where: { id: meetingId, workspaceId: ctx.workspace.id }, data: { title, attendees: names(str(fd, "attendees")) } });
    refresh(meetingId);
  });
}

export async function deleteMeeting(meetingId: string): Promise<Result> {
  const res = await attempt(async () => {
    const ctx = await requireCtx("EDITOR");
    const m = await prisma.meeting.findFirstOrThrow({ where: { id: meetingId, workspaceId: ctx.workspace.id } });
    await prisma.$transaction([
      prisma.draft.updateMany({ where: { workspaceId: ctx.workspace.id, kind: "MEETING_ACTIONS", targetId: meetingId, status: "PENDING" }, data: { status: "REJECTED", reviewNote: "The meeting was deleted." } }),
      prisma.meeting.delete({ where: { id: m.id } }),
    ]);
    await audit(ctx, "meeting.deleted", "meeting", m.id, `Deleted the notes for "${m.title}"`);
  });
  if (res?.error) return res;
  refresh();
  redirect("/app/meetings");
}

export async function resolveItem(itemId: string, _: Result, fd: FormData): Promise<Result> {
  return attempt(async () => {
    const ctx = await requireCtx("CONTRIBUTOR");
    const item = await prisma.meetingItem.findFirstOrThrow({ where: { id: itemId, workspaceId: ctx.workspace.id } });
    const reopen = item.status === "RESOLVED";
    await prisma.meetingItem.update({
      where: { id: item.id },
      data: reopen ? { status: "OPEN", resolvedAt: null, resolvedNote: null } : { status: "RESOLVED", resolvedAt: new Date(), resolvedNote: str(fd, "note") || null },
    });
    refresh(item.meetingId);
    return reopen ? "Reopened." : "Marked resolved.";
  });
}
