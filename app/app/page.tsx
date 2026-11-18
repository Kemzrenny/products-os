import Link from "next/link";
import { ArrowUpRight, Lightbulb, Bot, MessageSquareText, Sparkles, AlertTriangle, Target } from "lucide-react";
import { getCtx } from "@/lib/context";
import { commandCentre } from "@/lib/command";
import { greeting, fmtDate, timeAgo } from "@/lib/format";
import { OBJECTIVE_STATUS, RECOMMENDATION, WORK_STATUS, DRAFT_KIND, IDEA_STATUS } from "@/lib/labels";
import { atLeast } from "@/lib/roles";
import { Chip, Progress, Ring, Section, Stat, Empty, Avatar, Notice } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { startBriefing } from "@/app/actions/agents";
import Markdown from "@/components/Markdown";

export const metadata = { title: "Command Centre" };

export default async function CommandCentre({ searchParams }: PageProps<"/app">) {
  const ctx = await getCtx();
  const { denied } = await searchParams;
  const d = await commandCentre(ctx.workspace.id);
  const first = ctx.user.name.split(" ")[0];
  const avgProgress = d.objectives.length ? Math.round(d.objectives.reduce((a, o) => a + o.computed, 0) / d.objectives.length) : 0;
  const active = d.initiatives.filter((i) => i.status !== "DONE").length;
  const pending = d.pendingIdeas.length + d.pendingDrafts.length;

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-[11.5px] font-medium text-subtle">Pages / Command Centre / Overview</p>
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em] sm:text-[28px]">
          {greeting()}, {first}
        </h1>
        <p className="text-xs text-muted">{fmtDate(new Date(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {ctx.workspace.name}</p>
      </header>

      {denied && <Notice tone="amber">Your role doesn&apos;t give you access to that page. Ask an admin if you need it.</Notice>}

      {d.objectives.length === 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-4 bg-ink p-6 text-white">
          <div className="flex flex-col gap-1">
            <p className="display text-3xl">
              Start with your <em>strategy.</em>
            </p>
            <p className="text-sm text-white/70">Add your objectives first. Every idea and initiative is judged against them.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {ctx.role === "ADMIN" && (
              <Link href="/app/import" className="btn bg-white text-ink hover:bg-white/90">
                Import from a spreadsheet <ArrowUpRight size={14} aria-hidden />
              </Link>
            )}
            <Link href="/app/strategy" className="btn border border-white/30 text-white hover:bg-white/10">
              Set strategy
            </Link>
          </div>
        </div>
      )}

      <section aria-label="Quick actions" className="grid gap-3 sm:grid-cols-3">
        <QuickAction href="/app/ideas/new" icon={<Lightbulb size={16} aria-hidden />} kind="Idea" title="Submit an idea" text="Capture a request or problem. AI evaluates it against your goals." />
        <QuickAction href="/app/agents" icon={<Bot size={16} aria-hidden />} kind="Agents" title="Run an agent" text="Find strategy gaps, rank the backlog, or draft a PRD." />
        <QuickAction href="/app/copilot" icon={<MessageSquareText size={16} aria-hidden />} kind="Copilot" title="Ask Copilot" text="&quot;What's at risk this month and why?&quot;" />
      </section>

      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Objective progress" value={`${avgProgress}%`} note={`Across ${d.objectives.length} objective${d.objectives.length === 1 ? "" : "s"}`} href="/app/strategy" />
        <Stat label="Active initiatives" value={active} note={`${d.statusCounts.DONE} done`} href="/app/roadmap" />
        <Stat label="Need attention" value={<span className={d.atRisk.length ? "text-warn" : ""}>{d.atRisk.length}</span>} note="At risk, blocked, late or unaligned" href="#at-risk" />
        <Stat label="Awaiting decision" value={pending} note={`${d.pendingIdeas.length} ideas · ${d.pendingDrafts.length} drafts`} href="#pending" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col gap-6">
          <Section title={d.period ? `Objective progress · ${d.period}` : "Objective progress"} action={<Link href="/app/strategy" className="link text-xs">Strategy</Link>}>
            {d.objectives.length === 0 ? (
              <Empty title="No objectives yet">Add the company objectives this period commits to.</Empty>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {d.objectives.map((o) => (
                  <li key={o.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <Ring value={o.computed} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/app/strategy#o-${o.id}`} className="text-sm font-bold hover:underline">{o.title}</Link>
                      <p className="truncate text-xs text-muted">
                        {o.keyResults.length ? `${o.keyResults.length} key result${o.keyResults.length === 1 ? "" : "s"}` : (o.metric ?? "No metric yet")}
                        {o.target ? ` · target ${o.target}` : ""} · {o._count.initiatives} initiative{o._count.initiatives === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Chip tone={OBJECTIVE_STATUS[o.status].tone}>{OBJECTIVE_STATUS[o.status].label}</Chip>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section id="at-risk" title={<span className="inline-flex items-center gap-2"><AlertTriangle size={15} aria-hidden className="text-warn" /> At-risk initiatives</span>}>
            {d.atRisk.length === 0 ? (
              <p className="text-sm text-muted">Nothing is at risk, blocked, late or unaligned. </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {d.atRisk.map((i) => (
                  <li key={i.id} className="rounded-xl border border-line p-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/app/initiatives/${i.id}`} className="text-sm font-bold hover:underline">{i.title}</Link>
                      <Chip tone={WORK_STATUS[i.status].tone}>{WORK_STATUS[i.status].label}</Chip>
                    </div>
                    <ul className="mt-1.5 flex flex-col gap-0.5">
                      {i.risks.map((r) => (
                        <li key={r} className="text-xs text-warn">• {r}</li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[11px] text-subtle">{i.owner ? `Owner: ${i.owner.name}` : "No owner"}{i.product ? ` · ${i.product.name}` : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Portfolio" action={<Link href="/app/roadmap" className="link text-xs">Roadmap</Link>}>
            {d.products.length === 0 ? (
              <Empty title="No products yet">Add the products your team owns under Products &amp; KPIs.</Empty>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {d.products.map((p) => {
                  const counts = (s: string) => p.initiatives.filter((i) => i.status === s).length;
                  return (
                    <div key={p.id} className="rounded-xl border border-line p-4">
                      <p className="text-sm font-bold">{p.name}</p>
                      <p className="mb-3 text-xs text-muted">{p.initiatives.length} initiative{p.initiatives.length === 1 ? "" : "s"}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(["IN_PROGRESS", "AT_RISK", "BLOCKED", "NOT_STARTED", "DONE"] as const).map((s) =>
                          counts(s) ? (
                            <Chip key={s} tone={WORK_STATUS[s].tone}>
                              {counts(s)} {WORK_STATUS[s].label.toLowerCase()}
                            </Chip>
                          ) : null,
                        )}
                      </div>
                      {p.kpis.slice(0, 2).map((k) => (
                        <p key={k.id} className="mt-2 text-xs text-muted">
                          <b className="text-ink">{k.name}:</b> {k.current ?? "–"}
                          {k.unit ?? ""} of {k.target ?? "–"}
                          {k.unit ?? ""}
                        </p>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section
            title={<span className="inline-flex items-center gap-2"><Sparkles size={15} aria-hidden className="text-accent" /> AI briefing</span>}
            action={
              atLeast(ctx.role, "EDITOR") ? (
                <ActionButton action={startBriefing} className="btn-quiet btn-sm" pending="Writing…">
                  New briefing
                </ActionButton>
              ) : undefined
            }
          >
            {d.latestBriefing ? (
              <div className="flex flex-col gap-3">
                <div>
                  <p className="text-sm font-bold">{d.latestBriefing.title}</p>
                  <p className="text-[11px] text-subtle">{fmtDate(d.latestBriefing.createdAt)}</p>
                </div>
                <div className="max-h-72 overflow-hidden [mask-image:linear-gradient(to_bottom,black_75%,transparent)]">
                  <Markdown text={d.latestBriefing.body} />
                </div>
                <Link href="/app/briefings" className="link text-xs">Read and share</Link>
              </div>
            ) : (
              <p className="text-sm text-muted">No briefing yet. A new one is drafted every Monday morning, or press &ldquo;New briefing&rdquo;. You approve it before it can be shared.</p>
            )}
          </Section>

          <Section id="pending" title="Needs your decision">
            {pending === 0 ? (
              <p className="text-sm text-muted">You&apos;re all caught up.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {d.pendingDrafts.map((dr) => (
                  <li key={dr.id}>
                    <Link href={`/app/agents/drafts/${dr.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-field">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-accent-soft text-accent"><Bot size={15} aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold">{dr.title}</span>
                        <span className="block text-[11px] text-muted">{DRAFT_KIND[dr.kind]} · {timeAgo(dr.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
                {d.pendingIdeas.map((i) => (
                  <li key={i.id}>
                    <Link href={`/app/ideas/${i.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:bg-field">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-bg-2 text-ink-2"><Lightbulb size={15} aria-hidden /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold">{i.title}</span>
                        <span className="block text-[11px] text-muted">{IDEA_STATUS[i.status].label}</span>
                      </span>
                      {i.evaluations[0] && <Chip tone={RECOMMENDATION[i.evaluations[0].recommendation].tone}>{RECOMMENDATION[i.evaluations[0].recommendation].label}</Chip>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Initiative status">
            <div className="flex flex-col gap-2.5">
              {(Object.keys(WORK_STATUS) as (keyof typeof WORK_STATUS)[]).map((s) => {
                const n = d.statusCounts[s];
                const total = d.initiatives.length || 1;
                return (
                  <div key={s} className="flex items-center gap-3">
                    <span className="w-24 text-xs font-semibold text-ink-2">{WORK_STATUS[s].label}</span>
                    <div className="flex-1">
                      <Progress value={(n / total) * 100} tone={s === "DONE" ? "good" : s === "AT_RISK" ? "warn" : s === "BLOCKED" ? "bad" : "accent"} label={WORK_STATUS[s].label} />
                    </div>
                    <span className="w-6 text-right text-xs font-bold tabular-nums">{n}</span>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title={<span className="inline-flex items-center gap-2"><Target size={15} aria-hidden /> Recent activity</span>}>
            {d.recent.length === 0 ? (
              <p className="text-sm text-muted">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {d.recent.map((r) => (
                  <li key={r.id} className="flex gap-2.5">
                    <Avatar name={r.user?.name ?? "?"} size={24} />
                    <p className="text-xs leading-relaxed text-ink-2">
                      {r.summary} <span className="text-subtle">· {timeAgo(r.createdAt)}</span>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}

function QuickAction({ href, icon, kind, title, text }: { href: string; icon: React.ReactNode; kind: string; title: string; text: string }) {
  return (
    <Link href={href} className="card group flex flex-col gap-2 p-4 transition-shadow hover:shadow-[var(--shadow-float)]">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted">
        {icon} {kind}
      </span>
      <span className="text-[15px] font-extrabold">{title}</span>
      <span className="text-xs text-muted">{text}</span>
      <span className="btn-primary btn-sm mt-1 self-start">
        Open <ArrowUpRight size={13} aria-hidden />
      </span>
    </Link>
  );
}
