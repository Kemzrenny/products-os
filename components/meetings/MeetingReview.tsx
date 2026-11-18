import Link from "next/link";
import { ActionForm } from "@/components/forms";
import { Chip } from "@/components/ui";
import { approveDraft } from "@/app/actions/agents";
import { WORK_STATUS } from "@/lib/labels";
import type { MeetingProposals } from "@/lib/meetings";

function Group({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  if (!count) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-xs font-extrabold uppercase tracking-wide text-muted">
        {title} ({count})
      </legend>
      {children}
    </fieldset>
  );
}

function Row({ name, value, canApprove, children }: { name: string; value: number; canApprove: boolean; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-line p-3 text-sm has-[:checked]:border-ink has-[:checked]:bg-field">
      {canApprove && <input type="checkbox" name={name} value={value} defaultChecked className="mt-1" />}
      <span className="flex min-w-0 flex-1 flex-col gap-1">{children}</span>
    </label>
  );
}

// The updates a meeting implies. Untick anything that's wrong; nothing changes until
// someone approves.
export default function MeetingReview({ id, c, canApprove }: { id: string; c: MeetingProposals; canApprove: boolean }) {
  return (
    <ActionForm action={approveDraft} submit="Apply selected updates" pending="Applying…" className="flex flex-col gap-6" submitClass={canApprove ? "btn-primary" : "hidden"}>
      <input type="hidden" name="id" value={id} />
      <Group title="New tasks" count={c.tasks.length}>
        {c.tasks.map((t, i) => (
          <Row key={i} name="task" value={i} canApprove={canApprove}>
            {canApprove ? (
              <span className="flex flex-col gap-2">
                <textarea name={`taskTitle-${i}`} defaultValue={t.title} rows={2} className="field" aria-label="Task" />
                <input name={`taskOwner-${i}`} defaultValue={t.owner ?? ""} className="field" placeholder="Owner" aria-label="Owner" />
              </span>
            ) : (
              <span className="font-semibold">
                {t.title}
                {t.owner ? ` · ${t.owner}` : ""}
              </span>
            )}
            <span className="text-[11px] text-muted">
              {t.ownerId ? "Assigned to a team member" : t.owner ? "Owner isn't a member yet; the name is kept on the task" : "No owner"}
              {t.initiativeTitle ? ` · ${t.initiativeTitle}` : ""}
              {t.due ? ` · due ${t.due}` : ""}
            </span>
          </Row>
        ))}
      </Group>
      <Group title="Close tasks reported done" count={c.closeTasks.length}>
        {c.closeTasks.map((t, i) => (
          <Row key={i} name="close" value={i} canApprove={canApprove}>
            <span className="font-semibold">{t.title}</span>
            <span className="text-xs text-muted">{t.note}</span>
          </Row>
        ))}
      </Group>
      <Group title="Initiative status" count={c.initiativeUpdates.length}>
        {c.initiativeUpdates.map((u, i) => (
          <Row key={i} name="status" value={i} canApprove={canApprove}>
            <span className="flex flex-wrap items-center gap-2">
              <Link href={`/app/initiatives/${u.initiativeId}`} className="font-semibold hover:underline">{u.title}</Link>
              <Chip tone={WORK_STATUS[u.from as keyof typeof WORK_STATUS]?.tone ?? "grey"}>{WORK_STATUS[u.from as keyof typeof WORK_STATUS]?.label ?? u.from}</Chip>→
              <Chip tone={WORK_STATUS[u.status].tone}>{WORK_STATUS[u.status].label}</Chip>
            </span>
            <span className="text-xs text-muted">{u.note}</span>
          </Row>
        ))}
      </Group>
      <Group title="Key result check-ins" count={c.checkins.length}>
        {c.checkins.map((k, i) => (
          <Row key={i} name="checkin" value={i} canApprove={canApprove}>
            <span className="font-semibold">
              {k.title}: {k.value}
              {k.unit ?? ""}
            </span>
            <span className="text-xs text-muted">{k.note}</span>
          </Row>
        ))}
      </Group>
      <Group title="Decisions and requests for the log" count={c.decisions.length}>
        {c.decisions.map((d, i) => (
          <Row key={i} name="decision" value={i} canApprove={canApprove}>
            <span>
              <Chip tone={d.kind === "DECISION" ? "green" : "blue"} dot={false}>{d.kind === "DECISION" ? "Decision" : "Request"}</Chip> {d.text}
            </span>
          </Row>
        ))}
      </Group>
      <Group title="Blockers to track" count={c.blockers.length}>
        {c.blockers.map((b, i) => (
          <Row key={i} name="blocker" value={i} canApprove={canApprove}>
            <span>{b.text}</span>
            {b.owner && <span className="text-[11px] text-muted">Raised by {b.owner}</span>}
          </Row>
        ))}
      </Group>
      <Group title="Earlier blockers now cleared" count={c.resolveBlockers.length}>
        {c.resolveBlockers.map((b, i) => (
          <Row key={i} name="resolve" value={i} canApprove={canApprove}>
            <span className="font-semibold">{b.text}</span>
            <span className="text-xs text-muted">{b.note}</span>
          </Row>
        ))}
      </Group>
      <Group title="New ideas for the backlog" count={c.ideas.length}>
        {c.ideas.map((idea, i) => (
          <Row key={i} name="idea" value={i} canApprove={canApprove}>
            <span className="font-semibold">{idea.title}</span>
            {idea.problem && <span className="text-xs text-muted">{idea.problem}</span>}
          </Row>
        ))}
      </Group>
      {!canApprove && <p className="hint">An editor or admin applies these.</p>}
    </ActionForm>
  );
}
