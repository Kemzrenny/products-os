// Pure: no database or AI, so it can be unit tested.

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

// Builds one transcript from the parts. A room recording is its parts in order. An in-app
// call has a track per person: their lines are put in time order with their name on each.
export function mergeTranscript(segments: { track: string; speaker: string | null; startSec: number; text: string | null; status: string }[]) {
  const done = segments.filter((s) => s.status === "DONE" && s.text);
  const room = done.filter((s) => !s.track).sort((a, b) => a.startSec - b.startSec);
  const lines: { at: number; order: number; text: string }[] = room.map((s, i) => ({ at: s.startSec, order: i, text: `[${clock(s.startSec)}]\n${s.text}` }));
  let order = lines.length;
  for (const s of done.filter((x) => x.track)) {
    const who = s.speaker ?? "Speaker";
    let at = s.startSec;
    for (const raw of s.text!.split("\n")) {
      const m = /^\s*\[(\d+):(\d{1,2})(?::(\d{1,2}))?\]\s*(.*)$/.exec(raw);
      if (m) {
        const secs = m[3] !== undefined ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : Number(m[1]) * 60 + Number(m[2]);
        at = s.startSec + secs;
        if (m[4].trim()) lines.push({ at, order: order++, text: `[${clock(at)}] ${who}: ${m[4].trim()}` });
      } else if (raw.trim()) {
        const last = lines[lines.length - 1];
        if (last && last.text.includes(`] ${who}: `) && last.at === at) last.text += ` ${raw.trim()}`;
        else lines.push({ at, order: order++, text: `[${clock(at)}] ${who}: ${raw.trim()}` });
      }
    }
  }
  return lines
    .sort((a, b) => a.at - b.at || a.order - b.order)
    .map((l) => l.text)
    .join("\n");
}
