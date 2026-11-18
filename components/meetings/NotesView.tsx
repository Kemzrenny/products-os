import type { MeetingNotes } from "@/lib/meetings";

function List({ title, items, tone }: { title: string; items: React.ReactNode[]; tone?: "warn" | "bad" | "good" }) {
  if (!items.length) return null;
  const color = tone === "warn" ? "marker:text-warn" : tone === "bad" ? "marker:text-bad" : tone === "good" ? "marker:text-good" : "marker:text-subtle";
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted">{title}</h3>
      <ul className={`flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-2 ${color}`}>
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </section>
  );
}

const OUTCOME = { done: "Done", progressing: "Progressing", blocked: "Blocked" } as Record<string, string>;

// The notes in the same order as the team's daily notes doc.
export default function NotesView({ n }: { n: MeetingNotes }) {
  return (
    <div className="flex flex-col gap-6">
      <List title="Summary" items={n.summary} />
      {n.updates.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-extrabold uppercase tracking-wide text-muted">Updates by person and workstream</h3>
          <div className="flex flex-col gap-3">
            {n.updates.map((u, i) => (
              <div key={i} className="rounded-2xl border border-line p-3">
                <p className="text-sm font-extrabold">
                  {u.workstream}
                  {u.people && u.people !== u.workstream && <span className="font-semibold text-muted"> · {u.people}</span>}
                </p>
                <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5 text-sm leading-relaxed text-ink-2 marker:text-subtle">
                  {u.points.map((p, j) => (
                    <li key={j}>{p}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
      <List
        title="Decisions and requests"
        items={n.decisions.map((d) => (
          <>
            {d.kind === "request" ? <b>Request: </b> : <b>Decision: </b>}
            {d.text}
          </>
        ))}
        tone="good"
      />
      <List title="Blockers and dependencies" items={n.blockers.map((b) => `${b.text}${b.owner ? ` (${b.owner})` : ""}`)} tone="bad" />
      <List title="Next actions" items={n.nextActions.map((a) => (a.owner ? <><b>{a.owner}:</b> {a.text}</> : a.text))} />
      <List title="Checks on earlier actions" items={n.previousChecks.map((p) => <><b>{p.label}</b> · {OUTCOME[p.outcome] ?? p.outcome}. {p.note}</>)} />
      <div className="grid gap-6 2xl:grid-cols-2">
        <List title="Highlights" items={n.highlights} tone="good" />
        <List title="Lowlights" items={n.lowlights} tone="warn" />
        <List title="Insights" items={n.insights} />
      </div>
      <List title="Needs confirmation" items={n.needsConfirmation} tone="warn" />
    </div>
  );
}
