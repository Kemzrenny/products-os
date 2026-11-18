import Link from "next/link";
import { Plus, AlertTriangle, Columns3, GanttChart } from "lucide-react";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { atLeast } from "@/lib/roles";
import { HORIZON, WORK_STATUS } from "@/lib/labels";
import { riskReasons } from "@/lib/command";
import { fmtShort } from "@/lib/format";
import { PageHeader, Chip, Avatar, Empty, Progress } from "@/components/ui";
import { AutoSelect } from "@/components/forms";
import { moveInitiative } from "@/app/actions/planning";
import type { Horizon } from "@/lib/generated/prisma/enums";

export const metadata = { title: "Roadmap" };

const HORIZONS: Horizon[] = ["NOW", "NEXT", "LATER"];

export default async function RoadmapPage({ searchParams }: PageProps<"/app/roadmap">) {
  const ctx = await getCtx();
  const sp = await searchParams;
  const view = sp.view === "timeline" ? "timeline" : "board";
  const product = typeof sp.product === "string" ? sp.product : "";
  const objective = typeof sp.objective === "string" ? sp.objective : "";
  const [initiatives, products, objectives] = await Promise.all([
    prisma.initiative.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        ...(product ? { productId: product } : {}),
        ...(objective ? { objectives: { some: { objectiveId: objective } } } : {}),
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      include: {
        owner: { select: { name: true } },
        product: { select: { name: true } },
        objectives: { include: { objective: { select: { id: true, title: true } } } },
        milestones: { select: { status: true, dueDate: true, title: true } },
        tasks: { select: { status: true } },
      },
    }),
    prisma.product.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
    prisma.objective.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, title: true } }),
  ]);
  const editor = atLeast(ctx.role, "EDITOR");
  const progressOf = (i: (typeof initiatives)[number]) => {
    if (i.status === "DONE") return 100;
    const all = [...i.milestones, ...i.tasks];
    return all.length ? Math.round((all.filter((x) => x.status === "DONE").length / all.length) * 100) : 0;
  };
  const q = (o: Record<string, string>) => {
    const p = new URLSearchParams({ ...(view === "timeline" ? { view } : {}), ...(product ? { product } : {}), ...(objective ? { objective } : {}), ...o });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/app/roadmap?${p}`;
  };

  return (
    <>
      <PageHeader crumbs={["Planning", "Roadmap"]} title="Roadmap" lead="Approved ideas and strategic initiatives, each tied to the objective it serves.">
        {editor && (
          <Link href="/app/initiatives/new" className="btn-primary">
            <Plus size={14} aria-hidden /> New initiative
          </Link>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="View" className="flex gap-1 rounded-full border border-line bg-card p-1 shadow-[var(--shadow-soft)]">
          <Link href={q({ view: "" })} aria-current={view === "board" ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${view === "board" ? "bg-ink text-white" : "text-ink-2 hover:bg-bg-2"}`}>
            <Columns3 size={13} aria-hidden /> Now / Next / Later
          </Link>
          <Link href={q({ view: "timeline" })} aria-current={view === "timeline" ? "page" : undefined} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${view === "timeline" ? "bg-ink text-white" : "text-ink-2 hover:bg-bg-2"}`}>
            <GanttChart size={13} aria-hidden /> Timeline
          </Link>
        </nav>
        <form className="flex flex-wrap gap-2" action="/app/roadmap">
          {view === "timeline" && <input type="hidden" name="view" value="timeline" />}
          <select name="product" defaultValue={product} className="field h-9 min-h-9 w-auto py-0 text-xs" aria-label="Product">
            <option value="">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select name="objective" defaultValue={objective} className="field h-9 min-h-9 w-auto max-w-56 py-0 text-xs" aria-label="Objective">
            <option value="">All objectives</option>
            {objectives.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
          <button className="btn-quiet btn-sm h-9">Filter</button>
        </form>
      </div>

      {initiatives.length === 0 ? (
        <div className="card">
          <Empty title="The roadmap is empty" action={editor ? <Link href="/app/initiatives/new" className="btn-primary">Add an initiative</Link> : undefined}>
            Approve an idea, add an initiative directly, or let the Strategy Agent propose some.
          </Empty>
        </div>
      ) : view === "board" ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {HORIZONS.map((h) => {
            const items = initiatives.filter((i) => i.horizon === h);
            return (
              <section key={h} aria-label={HORIZON[h]} className="flex flex-col gap-3 rounded-2xl bg-bg-2 p-3">
                <h2 className="flex items-center justify-between px-1 text-sm font-extrabold">
                  {HORIZON[h]} <span className="text-xs font-semibold text-muted">{items.length}</span>
                </h2>
                {items.length === 0 && <p className="px-1 pb-2 text-xs text-muted">Nothing here.</p>}
                {items.map((i) => {
                  const risks = riskReasons(i);
                  return (
                    <article key={i.id} className="card flex flex-col gap-2.5 p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/app/initiatives/${i.id}`} className="text-sm font-bold leading-snug hover:underline">{i.title}</Link>
                        <Chip tone={WORK_STATUS[i.status].tone}>{WORK_STATUS[i.status].label}</Chip>
                      </div>
                      {i.objectives.length ? (
                        <p className="text-[11px] text-accent">→ {i.objectives.map((o) => o.objective.title).join(", ")}</p>
                      ) : (
                        <p className="flex items-center gap-1 text-[11px] font-semibold text-warn"><AlertTriangle size={11} aria-hidden /> Not linked to an objective</p>
                      )}
                      <Progress value={progressOf(i)} label={`${i.title} progress`} />
                      {risks.filter((r) => !r.startsWith("Not linked")).length > 0 && <p className="text-[11px] text-warn">{risks.filter((r) => !r.startsWith("Not linked")).join(" · ")}</p>}
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted">
                          {i.owner ? <Avatar name={i.owner.name} size={20} /> : null}
                          <span className="truncate">{i.product?.name ?? "No product"}{i.endDate ? ` · ends ${fmtShort(i.endDate)}` : ""}</span>
                        </span>
                        {editor && (
                          <AutoSelect
                            action={moveInitiative.bind(null, i.id)}
                            name="horizon"
                            label={`Move ${i.title}`}
                            value={i.horizon}
                            options={HORIZONS.map((x) => ({ value: x, label: HORIZON[x] }))}
                            className="field h-7 min-h-7 w-auto py-0 pr-6 text-[11px] font-semibold"
                          />
                        )}
                      </div>
                    </article>
                  );
                })}
              </section>
            );
          })}
        </div>
      ) : (
        <Timeline items={initiatives.map((i) => ({ id: i.id, title: i.title, status: i.status, start: i.startDate, end: i.endDate, owner: i.owner?.name ?? null, milestones: i.milestones }))} />
      )}
    </>
  );
}

type Row = { id: string; title: string; status: keyof typeof WORK_STATUS; start: Date | null; end: Date | null; owner: string | null; milestones: { dueDate: Date | null; title: string; status: string }[] };

// Initiatives with dates, laid out by quarter. Undated ones are listed underneath.
function Timeline({ items }: { items: Row[] }) {
  const dated = items.filter((i) => i.start || i.end);
  const undated = items.filter((i) => !i.start && !i.end);
  const now = new Date();
  const points = dated.flatMap((i) => [i.start, i.end]).filter((d): d is Date => !!d);
  const min = new Date(Math.min(now.getTime(), ...points.map((d) => d.getTime())));
  const max = new Date(Math.max(now.getTime() + 180 * 86_400_000, ...points.map((d) => d.getTime())));
  const qStart = new Date(Date.UTC(min.getUTCFullYear(), Math.floor(min.getUTCMonth() / 3) * 3, 1));
  const quarters: Date[] = [];
  for (let d = new Date(qStart); d <= max; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1))) quarters.push(d);
  const end = new Date(Date.UTC(quarters.at(-1)!.getUTCFullYear(), quarters.at(-1)!.getUTCMonth() + 3, 1));
  const span = end.getTime() - qStart.getTime();
  const pct = (d: Date) => Math.max(0, Math.min(100, ((d.getTime() - qStart.getTime()) / span) * 100));
  const bar: Record<string, string> = { NOT_STARTED: "bg-line-2", IN_PROGRESS: "bg-accent", AT_RISK: "bg-[#d97a2b]", BLOCKED: "bg-bad", DONE: "bg-good" };

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[220px_1fr] border-b border-line">
          <div className="px-4 py-2.5 text-xs font-semibold text-muted">Initiative</div>
          <div className="relative flex">
            {quarters.map((q) => (
              <div key={q.toISOString()} className="flex-1 border-l border-line px-2 py-2.5 text-xs font-bold">
                Q{Math.floor(q.getUTCMonth() / 3) + 1} {q.getUTCFullYear()}
              </div>
            ))}
          </div>
        </div>
        {dated.length === 0 && <p className="px-4 py-6 text-sm text-muted">No initiative has start or end dates yet. Add dates on an initiative to see it here.</p>}
        {dated.map((i) => {
          const s = i.start ?? i.end!;
          const e = i.end ?? i.start!;
          const left = pct(s);
          const width = Math.max(1.5, pct(e) - left);
          return (
            <div key={i.id} className="grid grid-cols-[220px_1fr] border-b border-line last:border-b-0">
              <div className="min-w-0 px-4 py-3">
                <Link href={`/app/initiatives/${i.id}`} className="block truncate text-[13px] font-bold hover:underline">{i.title}</Link>
                <p className="truncate text-[11px] text-muted">{i.owner ?? "No owner"} · {fmtShort(i.start)}{i.end ? ` to ${fmtShort(i.end)}` : ""}</p>
              </div>
              <div className="relative">
                <div aria-hidden className="absolute inset-0 flex">
                  {quarters.map((q) => <div key={q.toISOString()} className="flex-1 border-l border-line" />)}
                </div>
                <div aria-hidden className="absolute top-0 bottom-0 w-px bg-accent" style={{ left: `${pct(now)}%` }} />
                <div className={`absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full ${bar[i.status]}`} style={{ left: `${left}%`, width: `${width}%` }} title={WORK_STATUS[i.status].label} />
                {i.milestones
                  .filter((m) => m.dueDate)
                  .map((m) => (
                    <span key={m.title} title={`${m.title} · ${fmtShort(m.dueDate)}`} className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-card ${m.status === "DONE" ? "bg-good" : "bg-ink"}`} style={{ left: `${pct(m.dueDate!)}%` }} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
      {undated.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <p className="mb-1.5 text-xs font-semibold text-muted">No dates yet</p>
          <div className="flex flex-wrap gap-2">
            {undated.map((i) => (
              <Link key={i.id} href={`/app/initiatives/${i.id}`} className="rounded-full bg-bg-2 px-3 py-1 text-xs font-semibold hover:bg-line">{i.title}</Link>
            ))}
          </div>
        </div>
      )}
      <p className="border-t border-line px-4 py-2.5 text-[11px] text-subtle">The blue line is today. Diamonds are milestones.</p>
    </div>
  );
}
