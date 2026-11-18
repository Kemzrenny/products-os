import Link from "next/link";
import { Plus } from "lucide-react";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { IDEA_STATUS, RECOMMENDATION, EFFORT } from "@/lib/labels";
import { timeAgo } from "@/lib/format";
import { PageHeader, Chip, Empty } from "@/components/ui";
import type { IdeaStatus } from "@/lib/generated/prisma/enums";

export const metadata = { title: "Ideas" };

const TABS: { key: string; label: string; statuses: IdeaStatus[] }[] = [
  { key: "open", label: "Open", statuses: ["NEW", "EVALUATED", "EXPLORING"] },
  { key: "approved", label: "Approved", statuses: ["APPROVED"] },
  { key: "deferred", label: "Deferred", statuses: ["DEFERRED"] },
  { key: "rejected", label: "Rejected", statuses: ["REJECTED"] },
  { key: "all", label: "All", statuses: ["NEW", "EVALUATED", "EXPLORING", "APPROVED", "DEFERRED", "REJECTED"] },
];

export default async function IdeasPage({ searchParams }: PageProps<"/app/ideas">) {
  const ctx = await getCtx();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const product = typeof sp.product === "string" ? sp.product : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const [ideas, products, counts] = await Promise.all([
    prisma.idea.findMany({
      where: {
        workspaceId: ctx.workspace.id,
        status: { in: tab.statuses },
        ...(product ? { productId: product } : {}),
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }] } : {}),
      },
      orderBy: [{ rank: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      include: {
        evaluations: { orderBy: { createdAt: "desc" }, take: 1 },
        product: { select: { name: true } },
        submittedBy: { select: { name: true } },
        objectives: { include: { objective: { select: { title: true } } } },
        _count: { select: { evidence: true } },
      },
    }),
    prisma.product.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
    prisma.idea.groupBy({ by: ["status"], where: { workspaceId: ctx.workspace.id }, _count: true }),
  ]);
  const count = (statuses: IdeaStatus[]) => counts.filter((c) => statuses.includes(c.status)).reduce((a, c) => a + c._count, 0);
  const link = (o: Record<string, string>) => {
    const p = new URLSearchParams({ ...(sp.tab ? { tab: String(sp.tab) } : {}), ...(product ? { product } : {}), ...(q ? { q } : {}), ...o });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/app/ideas?${p}`;
  };

  return (
    <>
      <PageHeader crumbs={["Ideas", tab.label]} title="Ideas" lead="Every idea, request and problem, evaluated against your strategy. Ranked by the Prioritisation Agent once you approve its ranking.">
        <Link href="/app/ideas/new" className="btn-primary">
          <Plus size={14} aria-hidden /> Submit idea
        </Link>
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Idea status" className="flex flex-wrap gap-1 rounded-full border border-line bg-card p-1 shadow-[var(--shadow-soft)]">
          {TABS.map((t) => (
            <Link key={t.key} href={link({ tab: t.key === "open" ? "" : t.key })} aria-current={t.key === tab.key ? "page" : undefined} className={`rounded-full px-3 py-1.5 text-xs font-bold ${t.key === tab.key ? "bg-ink text-white" : "text-ink-2 hover:bg-bg-2"}`}>
              {t.label} <span className="opacity-60">{count(t.statuses)}</span>
            </Link>
          ))}
        </nav>
        <form className="flex flex-wrap gap-2" action="/app/ideas">
          {sp.tab && <input type="hidden" name="tab" value={String(sp.tab)} />}
          <select name="product" defaultValue={product} className="field h-9 min-h-9 w-auto py-0 text-xs" aria-label="Product">
            <option value="">All products</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input name="q" defaultValue={q} placeholder="Search ideas" className="field h-9 min-h-9 w-48 py-0 text-xs" aria-label="Search ideas" />
          <button className="btn-quiet btn-sm h-9">Filter</button>
        </form>
      </div>

      {ideas.length === 0 ? (
        <div className="card">
          <Empty title="Nothing here yet" action={<Link href="/app/ideas/new" className="btn-primary">Submit an idea</Link>}>
            Ideas can come from anyone: the CEO, sales, support or customers.
          </Empty>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line">
            {ideas.map((i) => {
              const ev = i.evaluations[0];
              return (
                <li key={i.id}>
                  <Link href={`/app/ideas/${i.id}`} className="flex flex-col gap-2 px-5 py-4 hover:bg-field sm:flex-row sm:items-center sm:gap-4">
                    {i.rank && tab.key === "open" && <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{i.rank}</span>}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{i.title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {i.product?.name ?? "No product"} · {i.source ?? "No source"} · {i.submittedBy.name} · {timeAgo(i.createdAt)}
                        {i.effort ? ` · ${EFFORT[i.effort].split(" ")[0]}` : ""} · {i._count.evidence} evidence
                      </p>
                      {i.objectives.length > 0 && <p className="mt-1 truncate text-[11px] text-accent">Serves: {i.objectives.map((o) => o.objective.title).join(", ")}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {ev && (
                        <span className="text-[11px] text-muted tabular-nums">
                          Impact <b className="text-ink">{ev.impactScore}</b> · Fit <b className="text-ink">{ev.alignmentScore}</b>
                        </span>
                      )}
                      {ev && i.status === "EVALUATED" && <Chip tone={RECOMMENDATION[ev.recommendation].tone}>{RECOMMENDATION[ev.recommendation].label}</Chip>}
                      <Chip tone={IDEA_STATUS[i.status].tone}>{IDEA_STATUS[i.status].label}</Chip>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
