import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { aiJson, aiTranscribe } from "@/lib/gemini";
import type { Ctx } from "@/lib/context";
import { teamMatcher } from "@/lib/import/apply";
import { similarity } from "@/lib/import/values";
import type { WorkStatus } from "@/lib/generated/prisma/enums";

// Meetings: transcribe the call in parts, write the notes in the team's own format, and
// propose the updates the call implies. Proposals go through the usual approval.

// ---------- Vocabulary ----------

// Names the transcription should spell right: the team, products, initiatives and the
// words the team uses for its work.
export async function vocabulary(ctx: Ctx, attendees: string[]) {
  const [members, products, initiatives, krs] = await Promise.all([
    prisma.member.findMany({ where: { organisationId: ctx.org.id }, select: { user: { select: { name: true } } } }),
    prisma.product.findMany({ where: { workspaceId: ctx.workspace.id }, select: { name: true } }),
    prisma.initiative.findMany({ where: { workspaceId: ctx.workspace.id, status: { not: "DONE" } }, select: { title: true }, take: 60 }),
    prisma.keyResult.findMany({ where: { objective: { workspaceId: ctx.workspace.id } }, select: { title: true }, take: 40 }),
  ]);
  const people = [...new Set([...attendees, ...members.map((m) => m.user.name)])];
  return {
    people,
    terms: [ctx.org.name, ...products.map((p) => p.name), ...initiatives.map((i) => i.title)].filter(Boolean).slice(0, 120),
    krs: krs.map((k) => k.title).slice(0, 40),
  };
}

function transcribeInstruction(meeting: { title: string; attendees: string[] }, vocab: Awaited<ReturnType<typeof vocabulary>>, part: number) {
  return `Transcribe part ${part + 1} of a recorded product and engineering meeting ("${meeting.title}") at a company in Lagos, Nigeria.
- Write what is said, word for word, in the language spoken. Keep Nigerian English, Yoruba or Pidgin phrases as spoken.
- Start each turn on a new line with the speaker's name and a colon when you can tell who is speaking from context (people address each other by name). Otherwise use "Speaker:".
- People who may speak: ${vocab.people.join(", ") || "not given"}.
- Spell these names and terms exactly like this when you hear them: ${vocab.terms.join("; ") || "none"}.
- If a word is unclear, write your best guess followed by [?]. Don't summarise or tidy up.
- If there is no speech, respond with exactly: [no speech]`;
}

function speakerInstruction(meeting: { title: string }, vocab: Awaited<ReturnType<typeof vocabulary>>, speaker: string) {
  return `This is ${speaker}'s own microphone during an online product and engineering meeting ("${meeting.title}") at a company in Lagos, Nigeria.
- Transcribe only what ${speaker} says, word for word, in the language spoken. Ignore faint voices of other people coming through speakers.
- Start each new sentence group on its own line with the time from the start of this clip in square brackets, like [0:42].
- Spell these names and terms exactly like this when you hear them: ${[...vocab.people, ...vocab.terms].join("; ") || "none"}.
- If a word is unclear, write your best guess followed by [?]. Don't summarise or tidy up.
- If ${speaker} doesn't speak, respond with exactly: [no speech]`;
}

export type Part = { track?: string; speaker?: string | null; index: number; startSec: number; durationSec: number | null };

export async function transcribePart(ctx: Ctx, meetingId: string, part: Part, audio: Buffer, mime: string) {
  const meeting = await prisma.meeting.findFirstOrThrow({ where: { id: meetingId, workspaceId: ctx.workspace.id } });
  const vocab = await vocabulary(ctx, meeting.attendees);
  const track = part.track ?? "";
  const key = { meetingId_track_index: { meetingId, track, index: part.index } };
  await prisma.meetingSegment.upsert({
    where: key,
    create: { meetingId, track, speaker: part.speaker ?? null, index: part.index, startSec: part.startSec, durationSec: part.durationSec, status: "PENDING" },
    update: { status: "PENDING", error: null, startSec: part.startSec, durationSec: part.durationSec },
  });
  try {
    const instruction = track && part.speaker ? speakerInstruction(meeting, vocab, part.speaker) : transcribeInstruction(meeting, vocab, part.index);
    const { text } = await aiTranscribe(audio, mime, instruction, () => (track ? fakeSpeakerTranscript(part.speaker ?? "Speaker", part.index) : fakeTranscript(meeting.attendees, part.index)));
    const clean = text.trim() === "[no speech]" ? "" : text.trim();
    await prisma.meetingSegment.update({ where: key, data: { status: "DONE", text: clean } });
    return clean;
  } catch (err) {
    await prisma.meetingSegment.update({ where: key, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 300) : "Failed" } });
    throw err;
  }
}

function fakeTranscript(attendees: string[], index: number) {
  const [a = "Tolu", b = "Samson", c = "Jake"] = attendees;
  if (index > 0) return `${c}: Monitoring access is still not sorted for two people.\n${a}: We agreed to ship the homepage first, then account components.`;
  return `${a}: I finished the flashcards and the audio reader on Cubbes Web. The homepage is next, two days once I start. I'll share the remaining components and estimates in the channel today.\n${b}: Google recording is done and pushed. Zoom is blocked, waiting on credentials from Emmanuel.\n${c}: Sentry is configured on staging. I'll compare it with Datadog this week.`;
}

function fakeSpeakerTranscript(speaker: string, index: number) {
  if (index > 0) return "[no speech]";
  const first = speaker.split(" ")[0];
  return first.length % 2
    ? `[0:03] Good morning everyone, ${first} here.\n[0:40] I'll update the release notes before the end of the day.`
    : `[0:12] Morning. The staging build is done.\n[0:55] I'll pair with the team on the login bug today.`;
}

export { mergeTranscript } from "@/lib/meetings-merge";

// ---------- Notes ----------

const notesSchema = {
  type: "object",
  properties: {
    summary: { type: "array", items: { type: "string" }, description: "3 to 5 bullets: the main points of the meeting." },
    updates: {
      type: "array",
      description: "Updates grouped by workstream, in the order discussed.",
      items: {
        type: "object",
        properties: {
          workstream: { type: "string", description: "e.g. 'Cubbes Web', 'Student Mobile', 'Lecturer Portal'" },
          people: { type: "string", description: "Who gave the update, e.g. 'Tolu' or 'Dayo/Murewa'. 'Unclear' if attribution is unclear." },
          points: { type: "array", items: { type: "string" } },
        },
        required: ["workstream", "people", "points"],
      },
    },
    decisions: {
      type: "array",
      items: { type: "object", properties: { text: { type: "string" }, kind: { type: "string", enum: ["decision", "request"] } }, required: ["text", "kind"] },
    },
    blockers: { type: "array", items: { type: "object", properties: { text: { type: "string" }, owner: { type: "string" }, initiativeRef: { type: "string" } }, required: ["text"] } },
    nextActions: { type: "array", items: { type: "object", properties: { text: { type: "string" }, owner: { type: "string" } }, required: ["text"] } },
    highlights: { type: "array", items: { type: "string" } },
    lowlights: { type: "array", items: { type: "string" } },
    insights: { type: "array", items: { type: "string" } },
    needsConfirmation: { type: "array", items: { type: "string" }, description: "Unclear names, owners, terms or claims to confirm." },
    previousChecks: {
      type: "array",
      description: "For each OPEN task or blocker listed in the context, what this meeting said about it. Leave out ones not mentioned.",
      items: {
        type: "object",
        properties: { ref: { type: "string", description: "task:<id> or blocker:<id>" }, outcome: { type: "string", enum: ["done", "progressing", "blocked"] }, note: { type: "string" } },
        required: ["ref", "outcome", "note"],
      },
    },
    proposals: {
      type: "object",
      properties: {
        tasks: {
          type: "array",
          description: "New commitments someone made in this meeting, as tasks.",
          items: { type: "object", properties: { title: { type: "string" }, owner: { type: "string" }, initiativeRef: { type: "string" }, due: { type: "string", description: "YYYY-MM-DD only if a date was stated" } }, required: ["title"] },
        },
        initiativeUpdates: {
          type: "array",
          description: "Initiatives whose status clearly changed in this meeting.",
          items: { type: "object", properties: { initiativeRef: { type: "string" }, status: { type: "string", enum: ["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "BLOCKED", "DONE"] }, note: { type: "string" } }, required: ["initiativeRef", "status", "note"] },
        },
        checkins: {
          type: "array",
          description: "Key results whose current number was stated in this meeting.",
          items: { type: "object", properties: { krRef: { type: "string" }, value: { type: "number" }, note: { type: "string" } }, required: ["krRef", "value", "note"] },
        },
        ideas: { type: "array", description: "New feature requests or problems raised that aren't on the roadmap.", items: { type: "object", properties: { title: { type: "string" }, problem: { type: "string" } }, required: ["title"] } },
      },
      required: ["tasks", "initiativeUpdates", "checkins", "ideas"],
    },
  },
  required: ["summary", "updates", "decisions", "blockers", "nextActions", "highlights", "lowlights", "insights", "needsConfirmation", "previousChecks", "proposals"],
};

const s = z.string();
const notesResult = z.object({
  summary: z.array(s),
  updates: z.array(z.object({ workstream: s, people: s, points: z.array(s) })),
  decisions: z.array(z.object({ text: s, kind: z.enum(["decision", "request"]) })),
  blockers: z.array(z.object({ text: s, owner: s.optional(), initiativeRef: s.optional() })),
  nextActions: z.array(z.object({ text: s, owner: s.optional() })),
  highlights: z.array(s),
  lowlights: z.array(s),
  insights: z.array(s),
  needsConfirmation: z.array(s),
  previousChecks: z.array(z.object({ ref: s, outcome: z.enum(["done", "progressing", "blocked"]), note: s })),
  proposals: z.object({
    tasks: z.array(z.object({ title: s, owner: s.optional(), initiativeRef: s.optional(), due: s.optional() })),
    initiativeUpdates: z.array(z.object({ initiativeRef: s, status: z.enum(["NOT_STARTED", "IN_PROGRESS", "AT_RISK", "BLOCKED", "DONE"]), note: s })),
    checkins: z.array(z.object({ krRef: s, value: z.number(), note: s })),
    ideas: z.array(z.object({ title: s, problem: s.optional() })),
  }),
});
type NotesResult = z.infer<typeof notesResult>;

export type MeetingNotes = Omit<NotesResult, "proposals" | "previousChecks"> & { previousChecks: { label: string; outcome: string; note: string }[] };

export type MeetingProposals = {
  meetingId: string;
  tasks: { title: string; owner: string | null; ownerId: string | null; initiativeId: string | null; initiativeTitle: string | null; due: string | null }[];
  closeTasks: { taskId: string; title: string; note: string }[];
  initiativeUpdates: { initiativeId: string; title: string; from: string; status: WorkStatus; note: string }[];
  checkins: { keyResultId: string; title: string; value: number; unit: string | null; note: string }[];
  decisions: { text: string; kind: "DECISION" | "REQUEST" }[];
  blockers: { text: string; owner: string | null; initiativeId: string | null }[];
  resolveBlockers: { itemId: string; text: string; note: string }[];
  ideas: { title: string; problem: string | null }[];
};

const NOTES_INSTRUCTION = `You write the notes for a product and engineering meeting, in the team's established format.
Rules the team cares about:
- Separate what was REPORTED from what is CONFIRMED. "Tolu reported the homepage is done" is not "the homepage is done". Say "reported", "intended", "estimated" where that is what was said; a target or estimate is not a delivery date.
- Mark unclear speaker attribution, names or terms ("speaker unclear", "transcribed as X") and list them under needsConfirmation.
- Group updates by workstream. Be specific: names, numbers, environments (staging/production), dates.
- Decisions are things the group agreed; requests are things someone asked for. Blockers name what is needed and from whom.
- nextActions are concrete commitments with an owner.
- Proposals must only reference ids that appear in the context (initiative:<id>, kr:<id>). Only propose a status change or a check-in when the meeting clearly stated it. Propose tasks only for commitments with a clear owner.
- For previousChecks, look at the OPEN tasks and blockers in the context and say what this meeting reported about each one mentioned. "done" only if completion was clearly reported.`;

async function meetingContext(ctx: Ctx, meeting: { id: string; series: string | null; date: Date }) {
  const [initiatives, krs, openTasks, openBlockers, previous] = await Promise.all([
    prisma.initiative.findMany({ where: { workspaceId: ctx.workspace.id, status: { not: "DONE" } }, select: { id: true, title: true, status: true, owner: { select: { name: true } }, leadNames: true }, take: 80 }),
    prisma.keyResult.findMany({ where: { objective: { workspaceId: ctx.workspace.id } }, select: { id: true, title: true, current: true, target: true, unit: true }, take: 60 }),
    prisma.task.findMany({
      where: { status: { not: "DONE" }, OR: [{ initiative: { workspaceId: ctx.workspace.id } }, { meeting: { workspaceId: ctx.workspace.id } }] },
      select: { id: true, title: true, owner: { select: { name: true } }, ownerName: true },
      orderBy: { createdAt: "desc" },
      take: 80,
    }),
    prisma.meetingItem.findMany({ where: { workspaceId: ctx.workspace.id, kind: "BLOCKER", status: "OPEN" }, select: { id: true, text: true, owner: true }, take: 40 }),
    meeting.series
      ? prisma.meeting.findFirst({ where: { workspaceId: ctx.workspace.id, series: meeting.series, status: "READY", date: { lt: meeting.date }, id: { not: meeting.id } }, orderBy: { date: "desc" }, select: { date: true, notes: true } })
      : null,
  ]);
  const lines = [
    "Initiatives (open):",
    ...initiatives.map((i) => `- [initiative:${i.id}] ${i.title} | ${i.status} | owner ${i.owner?.name ?? i.leadNames ?? "none"}`),
    "Key results:",
    ...krs.map((k) => `- [kr:${k.id}] ${k.title} | now ${k.current ?? "?"} of ${k.target ?? "?"}${k.unit ?? ""}`),
    "OPEN tasks:",
    ...openTasks.map((t) => `- [task:${t.id}] ${t.title} | owner ${t.owner?.name ?? t.ownerName ?? "none"}`),
    "OPEN blockers from earlier meetings:",
    ...openBlockers.map((b) => `- [blocker:${b.id}] ${b.text}${b.owner ? ` | ${b.owner}` : ""}`),
  ];
  const prevNotes = previous?.notes as MeetingNotes | null | undefined;
  if (prevNotes?.nextActions?.length) {
    lines.push(`Next actions from the previous ${meeting.series} (${previous!.date.toISOString().slice(0, 10)}):`, ...prevNotes.nextActions.map((a) => `- ${a.owner ? `${a.owner}: ` : ""}${a.text}`));
  }
  return { text: lines.join("\n"), initiatives, krs, openTasks, openBlockers };
}

function fakeNotes(transcript: string, c: Awaited<ReturnType<typeof meetingContext>>): NotesResult {
  const turns = transcript
    .split("\n")
    .map((l) => /^(?:\[[\d:]+\]\s*)?([A-Z][\w ./'-]{0,30}):\s*(.+)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ who: m[1], said: m[2] }));
  const byPerson = new Map<string, string[]>();
  for (const t of turns) byPerson.set(t.who, [...(byPerson.get(t.who) ?? []), t.said]);
  const said = (re: RegExp) => turns.filter((t) => re.test(t.said));
  const ref = (text: string) => {
    const best = c.initiatives.map((i) => ({ i, s: similarity(text, i.title) })).sort((a, b) => b.s - a.s)[0];
    return best && best.s >= 0.4 ? `initiative:${best.i.id}` : undefined;
  };
  const doneChecks = c.openTasks
    .filter((t) => turns.some((u) => /finished|done|completed|shipped/i.test(u.said) && similarity(u.said, t.title) >= 0.5))
    .map((t) => ({ ref: `task:${t.id}`, outcome: "done" as const, note: "Reported as finished in this meeting." }));
  return {
    summary: turns.slice(0, 3).map((t) => `${t.who}: ${t.said}`),
    updates: [...byPerson.entries()].map(([who, pts]) => ({ workstream: who, people: who, points: pts })),
    decisions: said(/agreed|decided/i).map((t) => ({ text: t.said, kind: "decision" as const })),
    blockers: said(/blocked|waiting on/i).map((t) => ({ text: t.said, owner: t.who, initiativeRef: ref(t.said) })),
    nextActions: said(/I'll|I will|will share|next/i).map((t) => ({ text: t.said, owner: t.who })),
    highlights: said(/finished|done|configured/i).map((t) => `${t.who}: ${t.said}`),
    lowlights: said(/blocked|still not/i).map((t) => `${t.who}: ${t.said}`),
    insights: [],
    needsConfirmation: [],
    previousChecks: doneChecks,
    proposals: {
      tasks: said(/I'll|I will/i).map((t) => ({ title: t.said.replace(/^.*?(I'll|I will)\s*/i, "").replace(/\.$/, ""), owner: t.who, initiativeRef: ref(t.said) })),
      initiativeUpdates: said(/blocked/i)
        .map((t) => ({ initiativeRef: ref(t.said) ?? "", status: "BLOCKED" as const, note: t.said }))
        .filter((u) => u.initiativeRef),
      checkins: [],
      ideas: [],
    },
  };
}

// Writes the notes and the proposed updates. The notes are saved on the meeting; the
// proposals become a draft for an editor to approve.
export async function writeNotes(ctx: Ctx, meetingId: string) {
  const meeting = await prisma.meeting.findFirstOrThrow({ where: { id: meetingId, workspaceId: ctx.workspace.id } });
  const transcript = meeting.transcript?.trim();
  if (!transcript) throw new Error("There's no transcript yet.");
  const c = await meetingContext(ctx, meeting);
  const run = await prisma.agentRun.create({ data: { workspaceId: ctx.workspace.id, agent: "MEETING", input: { meetingId }, strategyVersion: ctx.workspace.strategyVersion, startedById: ctx.user.id } });
  try {
    const { data, model } = await aiJson({
      instruction: `${NOTES_INSTRUCTION}\nMeeting: "${meeting.title}" on ${meeting.date.toISOString().slice(0, 10)}. Attendees: ${meeting.attendees.join(", ") || "not listed"}.`,
      context: `${c.text}\n\n---\nTranscript:\n${transcript.slice(0, 300_000)}`,
      schema: notesSchema,
      parse: notesResult,
      careful: true,
      fake: () => fakeNotes(transcript, c),
    });
    const match = await teamMatcher(ctx.org.id);
    const initiative = (r?: string) => c.initiatives.find((i) => `initiative:${i.id}` === r?.trim() || i.id === r?.trim()) ?? null;
    const kr = (r: string) => c.krs.find((k) => `kr:${k.id}` === r.trim() || k.id === r.trim()) ?? null;
    const task = (r: string) => c.openTasks.find((t) => `task:${t.id}` === r.trim()) ?? null;
    const blocker = (r: string) => c.openBlockers.find((b) => `blocker:${b.id}` === r.trim()) ?? null;

    const proposals: MeetingProposals = {
      meetingId,
      tasks: data.proposals.tasks.map((t) => {
        const owner = t.owner ? match(t.owner.split(/[/,&]/)[0]) : null;
        const i = initiative(t.initiativeRef);
        return { title: t.title.slice(0, 300), owner: t.owner ?? null, ownerId: owner?.id ?? null, initiativeId: i?.id ?? null, initiativeTitle: i?.title ?? null, due: /^\d{4}-\d{2}-\d{2}$/.test(t.due ?? "") ? t.due! : null };
      }),
      closeTasks: data.previousChecks.filter((p) => p.outcome === "done" && task(p.ref)).map((p) => ({ taskId: task(p.ref)!.id, title: task(p.ref)!.title, note: p.note })),
      initiativeUpdates: data.proposals.initiativeUpdates
        .filter((u) => initiative(u.initiativeRef) && initiative(u.initiativeRef)!.status !== u.status)
        .map((u) => ({ initiativeId: initiative(u.initiativeRef)!.id, title: initiative(u.initiativeRef)!.title, from: initiative(u.initiativeRef)!.status, status: u.status, note: u.note })),
      checkins: data.proposals.checkins.filter((k) => kr(k.krRef)).map((k) => ({ keyResultId: kr(k.krRef)!.id, title: kr(k.krRef)!.title, value: k.value, unit: kr(k.krRef)!.unit, note: k.note })),
      decisions: data.decisions.map((d) => ({ text: d.text, kind: d.kind === "request" ? "REQUEST" : "DECISION" })),
      blockers: data.blockers.map((b) => ({ text: b.text, owner: b.owner ?? null, initiativeId: initiative(b.initiativeRef)?.id ?? null })),
      resolveBlockers: data.previousChecks.filter((p) => p.outcome === "done" && blocker(p.ref)).map((p) => ({ itemId: blocker(p.ref)!.id, text: blocker(p.ref)!.text, note: p.note })),
      ideas: data.proposals.ideas.map((i) => ({ title: i.title, problem: i.problem ?? null })),
    };
    const { proposals: _proposals, previousChecks, ...rest } = data;
    void _proposals;
    const notes: MeetingNotes = {
      ...rest,
      previousChecks: previousChecks
        .map((p) => ({ label: task(p.ref)?.title ?? blocker(p.ref)?.text ?? "", outcome: p.outcome, note: p.note }))
        .filter((p) => p.label),
    };

    const count =
      proposals.tasks.length + proposals.closeTasks.length + proposals.initiativeUpdates.length + proposals.checkins.length + proposals.decisions.length + proposals.blockers.length + proposals.resolveBlockers.length + proposals.ideas.length;
    await prisma.$transaction(async (tx) => {
      await tx.meeting.update({ where: { id: meetingId }, data: { notes, status: "READY", processedAt: new Date(), error: null } });
      // A rerun replaces the pending proposals rather than stacking a second set.
      await tx.draft.updateMany({ where: { workspaceId: ctx.workspace.id, kind: "MEETING_ACTIONS", targetId: meetingId, status: "PENDING" }, data: { status: "REJECTED", reviewNote: "Replaced when the notes were rewritten." } });
      if (count > 0) {
        await tx.draft.create({
          data: {
            workspaceId: ctx.workspace.id,
            runId: run.id,
            kind: "MEETING_ACTIONS",
            title: `Updates from ${meeting.title}, ${meeting.date.toISOString().slice(0, 10)}`,
            summary: `${proposals.tasks.length} new task${proposals.tasks.length === 1 ? "" : "s"}, ${proposals.closeTasks.length} to close, ${proposals.initiativeUpdates.length} status change${proposals.initiativeUpdates.length === 1 ? "" : "s"}, ${proposals.decisions.length + proposals.blockers.length} for the log`,
            content: proposals as unknown as object,
            sources: [],
            targetId: meetingId,
          },
        });
      }
      await tx.agentRun.update({ where: { id: run.id }, data: { status: "DONE", model, finishedAt: new Date() } });
    });
  } catch (err) {
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 500) : "Failed", finishedAt: new Date() } });
    await prisma.meeting.update({ where: { id: meetingId }, data: { status: "FAILED", error: err instanceof Error ? err.message.slice(0, 500) : "Failed" } });
    throw err;
  }
}

// The notes as markdown, in the same shape as the team's daily notes doc.
export function notesMarkdown(m: { title: string; date: Date; attendees: string[]; notes: MeetingNotes | null }) {
  const n = m.notes;
  const out: string[] = [`## ${m.title}`, `${m.date.toISOString().slice(0, 10)}${m.attendees.length ? ` · ${m.attendees.join(", ")}` : ""}`];
  if (!n) return out.join("\n");
  const list = (title: string, items: string[]) => {
    if (items.length) out.push("", `### ${title}`, ...items.map((i) => `- ${i}`));
  };
  list("Summary", n.summary);
  if (n.updates.length) {
    out.push("", "### Updates by person and workstream");
    for (const u of n.updates) out.push(`- **${u.workstream}${u.people && u.people !== u.workstream ? ` (${u.people})` : ""}:** ${u.points.join(" ")}`);
  }
  list("Decisions and requests", n.decisions.map((d) => `${d.kind === "request" ? "Request: " : ""}${d.text}`));
  list("Blockers and dependencies", n.blockers.map((b) => `${b.text}${b.owner ? ` (${b.owner})` : ""}`));
  list("Next actions", n.nextActions.map((a) => `${a.owner ? `${a.owner}: ` : ""}${a.text}`));
  list("Checks on earlier actions", n.previousChecks.map((p) => `${p.label}: ${p.outcome}. ${p.note}`));
  list("Highlights", n.highlights);
  list("Blockers/Lowlights", n.lowlights);
  list("Insights", n.insights);
  list("Needs confirmation", n.needsConfirmation);
  return out.join("\n");
}
