import { Trash2 } from "lucide-react";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { ROLE_LABEL, ROLE_HELP } from "@/lib/roles";
import { timeAgo } from "@/lib/format";
import { aiConfigured } from "@/lib/gemini";
import { PageHeader, Section, Chip, Avatar, Notice } from "@/components/ui";
import { ActionForm, ActionButton, AutoSelect } from "@/components/forms";
import CopyButton from "@/components/CopyButton";
import InstallButton from "@/components/pwa/InstallButton";
import { updateOrganisation, updateWorkspace, createWorkspace, inviteMember, revokeInvite, changeRole, removeMember } from "@/app/actions/org";
import type { Role } from "@/lib/generated/prisma/enums";

export const metadata = { title: "Settings & team" };

const ROLES: Role[] = ["ADMIN", "EDITOR", "CONTRIBUTOR", "VIEWER"];

export default async function SettingsPage() {
  const ctx = await getCtx();
  const admin = ctx.role === "ADMIN";
  const [members, invites, workspaces] = await Promise.all([
    prisma.member.findMany({ where: { organisationId: ctx.org.id }, include: { user: { select: { name: true, email: true, lastActiveAt: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.invitation.findMany({ where: { organisationId: ctx.org.id, acceptedAt: null }, orderBy: { createdAt: "desc" } }),
    prisma.workspace.findMany({ where: { organisationId: ctx.org.id }, include: { _count: { select: { products: true, initiatives: true, ideas: true } } }, orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <>
      <PageHeader crumbs={["Settings"]} title="Settings & team" lead={`${ctx.org.name} · you're ${ROLE_LABEL[ctx.role].toLowerCase()}`}>
        <InstallButton className="btn-quiet" />
      </PageHeader>

      {!aiConfigured() && admin && <Notice tone="amber">AI is off. Add <code>GEMINI_API_KEY</code> to the project&apos;s environment variables in Vercel to turn on evaluations, agents and Copilot.</Notice>}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title={`Team (${members.length})`}>
          <ul className="flex flex-col divide-y divide-line">
            {members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar name={m.user.name} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{m.user.name}{m.userId === ctx.user.id && <span className="font-normal text-muted"> (you)</span>}</p>
                  <p className="truncate text-xs text-muted">{m.user.email}{m.user.lastActiveAt ? ` · active ${timeAgo(m.user.lastActiveAt)}` : ""}</p>
                </div>
                {admin && m.userId !== ctx.user.id ? (
                  <>
                    <AutoSelect action={changeRole.bind(null, m.id)} name="role" label={`${m.user.name}'s role`} value={m.role} options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
                    <ActionButton action={removeMember.bind(null, m.id)} className="btn-ghost btn-sm text-bad" confirm={`Remove ${m.user.name} from ${ctx.org.name}?`} showResult={false}>
                      <Trash2 size={13} aria-label={`Remove ${m.user.name}`} />
                    </ActionButton>
                  </>
                ) : (
                  <Chip dot={false}>{ROLE_LABEL[m.role]}</Chip>
                )}
              </li>
            ))}
          </ul>
        </Section>

        {admin && (
          <Section title="Invite someone">
            <ActionForm action={inviteMember} submit="Create invite link" reset className="flex flex-col gap-3">
              <div>
                <label className="label" htmlFor="inv-email">Email</label>
                <input id="inv-email" name="email" type="email" className="field" required placeholder="name@company.com" />
              </div>
              <fieldset>
                <legend className="label">Role</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ROLES.map((r) => (
                    <label key={r} className="flex cursor-pointer gap-2 rounded-xl border border-line p-3 has-[:checked]:border-ink has-[:checked]:bg-field">
                      <input type="radio" name="role" value={r} defaultChecked={r === "EDITOR"} className="mt-0.5" />
                      <span>
                        <span className="block text-xs font-bold">{ROLE_LABEL[r]}</span>
                        <span className="block text-[11px] text-muted">{ROLE_HELP[r]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </ActionForm>
            {invites.length > 0 && (
              <div className="mt-5 border-t border-line pt-4">
                <p className="eyebrow mb-2 text-[10px]">Waiting to join</p>
                <ul className="flex flex-col gap-2">
                  {invites.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-field p-2.5">
                      <span className="min-w-0 flex-1 text-xs">
                        <b>{i.email}</b> <span className="text-muted">· {ROLE_LABEL[i.role]} · {timeAgo(i.createdAt)}</span>
                      </span>
                      <CopyButton text={`/invite/${i.token}`} />
                      <ActionButton action={revokeInvite.bind(null, i.id)} className="btn-ghost btn-sm text-bad" showResult={false}>
                        Cancel
                      </ActionButton>
                    </li>
                  ))}
                </ul>
                <p className="hint mt-2">Send the link yourself (WhatsApp, Slack or email). It works once, for that email address.</p>
              </div>
            )}
          </Section>
        )}

        {admin && (
          <Section title="Organisation">
            <ActionForm action={updateOrganisation} className="flex flex-col gap-3">
              <div>
                <label className="label" htmlFor="org-name">Name</label>
                <input id="org-name" name="name" className="field" defaultValue={ctx.org.name} required />
              </div>
              <div>
                <label className="label" htmlFor="org-vision">Company vision</label>
                <textarea id="org-vision" name="vision" className="field min-h-20" defaultValue={ctx.org.vision ?? ""} />
              </div>
            </ActionForm>
          </Section>
        )}

        <Section id="workspaces" title="Workspaces">
          <ul className="flex flex-col gap-2">
            {workspaces.map((w) => (
              <li key={w.id} className={`rounded-xl border p-3 ${w.id === ctx.workspace.id ? "border-ink" : "border-line"}`}>
                <p className="text-sm font-bold">{w.name} {w.id === ctx.workspace.id && <span className="text-xs font-normal text-muted">· current</span>}</p>
                <p className="text-xs text-muted">{w._count.products} products · {w._count.initiatives} initiatives · {w._count.ideas} ideas</p>
              </li>
            ))}
          </ul>
          {admin && (
            <div className="mt-4 flex flex-col gap-5 border-t border-line pt-4">
              <ActionForm action={updateWorkspace} submit="Save workspace" submitClass="btn-quiet btn-sm" className="flex flex-col gap-3">
                <p className="text-xs font-bold">This workspace</p>
                <input name="name" className="field" defaultValue={ctx.workspace.name} required aria-label="Workspace name" />
                <div>
                  <label className="label" htmlFor="cap">Team capacity</label>
                  <input id="cap" name="capacity" className="field" defaultValue={ctx.workspace.capacityNote ?? ""} placeholder="e.g. 2 squads, about 16 engineer-weeks a quarter" />
                  <p className="hint">The AI uses this when it weighs effort.</p>
                </div>
              </ActionForm>
              <ActionForm action={createWorkspace} submit="Create workspace" submitClass="btn-quiet btn-sm" className="flex flex-col gap-2">
                <p className="text-xs font-bold">New workspace</p>
                <input name="name" className="field" required placeholder="e.g. Payments" aria-label="New workspace name" />
                <p className="hint">Each workspace has its own strategy, ideas and roadmap. Your team is shared.</p>
              </ActionForm>
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
