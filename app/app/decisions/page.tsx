import Link from "next/link";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { OUTCOME, RECOMMENDATION } from "@/lib/labels";
import { fmtDate } from "@/lib/format";
import { PageHeader, Chip, Empty } from "@/components/ui";
import type { DecisionOutcome } from "@/lib/generated/prisma/enums";

export const metadata = { title: "Decision history" };

export default async function DecisionsPage({ searchParams }: PageProps<"/app/decisions">) {
  const ctx = await getCtx();
  const sp = await searchParams;
  const outcome = (["APPROVED", "EXPLORING", "DEFERRED", "REJECTED"] as DecisionOutcome[]).find((o) => o === sp.outcome);
  const objective = typeof sp.objective === "string" ? sp.objective : "";
  const product = typeof sp.product === "string" ? sp.product : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const [decisions, objectives, products] = await Promise.all([
    prisma.decision.findMany({
      where: {
        idea: {
          workspaceId: ctx.workspace.id,
          ...(objective ? { objectives: { some: { objectiveId: objective } } } : {}),
          ...(product ? { productId: product } : {}),
          ...(q ? { title: { contains: q, mode: "insensitive" } } : {}),
        },
        ...(outcome ? { outcome } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { idea: { select: { id: true, title: true, product: { select: { name: true } } } }, decidedBy: { select: { name: true } } },
    }),
    prisma.objective.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, title: true } }),
    prisma.product.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
  ]);
  const agreed = decisions.filter((d) => d.aiRecommendation && ((d.aiRecommendation === "BUILD_NOW" && d.outcome === "APPROVED") || (d.aiRecommendation === "EXPLORE" && d.outcome === "EXPLORING") || (d.aiRecommendation === "DEFER" && d.outcome === "DEFERRED") || (d.aiRecommendation === "REJECT" && d.outcome === "REJECTED"))).length;
  const withAi = decisions.filter((d) => d.aiRecommendation).length;

  return (
    <>
      <PageHeader crumbs={["Ideas", "Decisions"]} title="Decision history" lead="Who decided what, when and why, and what the AI recommended at the time.">
        {withAi > 0 && <Chip tone="blue" dot={false}>Agreed with AI on {Math.round((agreed / withAi) * 100)}% of evaluated decisions</Chip>}
      </PageHeader>
      <form className="flex flex-wrap gap-2" action="/app/decisions">
        <select name="outcome" defaultValue={outcome ?? ""} className="field h-9 min-h-9 w-auto py-0 text-xs" aria-label="Decision">
          <option value="">All decisions</option>
          {Object.entries(OUTCOME).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select name="objective" defaultValue={objective} className="field h-9 min-h-9 w-auto max-w-56 py-0 text-xs" aria-label="Objective">
          <option value="">All objectives</option>
          {objectives.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
        </select>
        <select name="product" defaultValue={product} className="field h-9 min-h-9 w-auto py-0 text-xs" aria-label="Product">
          <option value="">All products</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input name="q" defaultValue={q} placeholder="Search" className="field h-9 min-h-9 w-44 py-0 text-xs" aria-label="Search" />
        <button className="btn-quiet btn-sm h-9">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        {decisions.length === 0 ? (
          <Empty title="No decisions yet">Decisions on ideas show up here with their reasons.</Empty>
        ) : (
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">Idea</th>
                <th className="px-3 py-3 font-semibold">Decision</th>
                <th className="px-3 py-3 font-semibold">AI said</th>
                <th className="px-3 py-3 font-semibold">Why</th>
                <th className="px-5 py-3 font-semibold">Who, when</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {decisions.map((d) => (
                <tr key={d.id} className="align-top">
                  <td className="px-5 py-3">
                    <Link href={`/app/ideas/${d.idea.id}`} className="font-bold hover:underline">{d.idea.title}</Link>
                    <p className="text-[11px] text-muted">{d.idea.product?.name ?? "No product"}</p>
                  </td>
                  <td className="px-3 py-3"><Chip tone={OUTCOME[d.outcome].tone}>{OUTCOME[d.outcome].label}</Chip></td>
                  <td className="px-3 py-3 text-xs text-muted">{d.recordedAtImport ? "Recorded at import" : d.aiRecommendation ? RECOMMENDATION[d.aiRecommendation].label : "–"}</td>
                  <td className="max-w-sm px-3 py-3 text-xs text-ink-2">{d.reason}</td>
                  <td className="px-5 py-3 text-xs text-muted">
                    {d.decidedBy.name}
                    <br />
                    {fmtDate(d.createdAt)} · v{d.strategyVersion}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
