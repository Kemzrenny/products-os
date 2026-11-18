import { Plus, Pencil, Trash2 } from "lucide-react";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { atLeast } from "@/lib/roles";
import { dateInput, fmtDate } from "@/lib/format";
import { krProgress } from "@/lib/strategy";
import { PageHeader, Section, Empty, Progress } from "@/components/ui";
import { ActionForm, ActionButton } from "@/components/forms";
import { saveProduct, deleteProduct, saveKpi, deleteKpi } from "@/app/actions/org";

export const metadata = { title: "Products & KPIs" };

export default async function ProductsPage() {
  const ctx = await getCtx();
  const products = await prisma.product.findMany({
    where: { workspaceId: ctx.workspace.id },
    orderBy: { createdAt: "asc" },
    include: { kpis: { orderBy: { createdAt: "asc" } }, _count: { select: { ideas: true, initiatives: true, okrs: true } } },
  });
  const admin = ctx.role === "ADMIN";
  const editor = atLeast(ctx.role, "EDITOR");

  return (
    <>
      <PageHeader crumbs={["Organisation", "Products"]} title="Products & KPIs" lead="The products your team owns, their vision, and the numbers that show whether they're working." />

      {products.length === 0 && !admin && <Empty title="No products yet">An admin adds products here.</Empty>}

      <div className="grid gap-6 lg:grid-cols-2">
        {products.map((p) => (
          <Section key={p.id} id={`p-${p.id}`} title={p.name} action={<span className="text-[11px] text-muted">{p._count.okrs} OKRs · {p._count.initiatives} initiatives · {p._count.ideas} ideas</span>}>
            {p.vision && <p className="display mb-1 text-xl">{p.vision}</p>}
            {p.description && <p className="mb-3 text-sm text-muted">{p.description}</p>}

            <p className="eyebrow mt-2 mb-2 text-[10px]">KPIs</p>
            {p.kpis.length === 0 ? (
              <p className="text-xs text-muted">No KPIs yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {p.kpis.map((k) => {
                  const v = krProgress(k);
                  return (
                    <li key={k.id} className="rounded-xl bg-field p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-bold">{k.name}</p>
                        <p className="text-xs text-muted tabular-nums">
                          {k.baseline != null && <>from {k.baseline}{k.unit} · </>}
                          <b className="text-ink">{k.current ?? "–"}{k.unit}</b> of {k.target ?? "–"}{k.unit}
                        </p>
                      </div>
                      {v !== null && <div className="mt-2"><Progress value={v} label={k.name} /></div>}
                      {k.dueDate && <p className="mt-1 text-[11px] text-subtle">Due {fmtDate(k.dueDate)}</p>}
                      {editor && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] font-bold text-accent">Update</summary>
                          <div className="mt-2 flex flex-col gap-2">
                            <KpiFields productId={p.id} k={k} />
                            {admin && (
                              <ActionButton action={deleteKpi.bind(null, k.id)} className="btn-ghost btn-sm self-start text-bad" confirm={`Delete the KPI "${k.name}"?`}>
                                Delete KPI
                              </ActionButton>
                            )}
                          </div>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {editor && (
              <details className="mt-3">
                <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-bold text-accent"><Plus size={12} aria-hidden /> Add a KPI</summary>
                <div className="mt-3"><KpiFields productId={p.id} /></div>
              </details>
            )}

            {admin && (
              <details className="mt-4 border-t border-line pt-3">
                <summary className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-accent"><Pencil size={12} aria-hidden /> Edit product</summary>
                <div className="mt-3 flex flex-col gap-3">
                  <ProductFields p={p} />
                  <ActionButton action={deleteProduct.bind(null, p.id)} className="btn-danger btn-sm self-start" confirm={`Delete ${p.name}? Its KPIs and OKRs go too; ideas and initiatives stay.`}>
                    <Trash2 size={13} aria-hidden /> Delete product
                  </ActionButton>
                </div>
              </details>
            )}
          </Section>
        ))}

        {admin && (
          <Section title={<span className="inline-flex items-center gap-1.5"><Plus size={14} aria-hidden /> Add a product</span>}>
            <ProductFields />
          </Section>
        )}
      </div>
    </>
  );
}

function ProductFields({ p }: { p?: { id: string; name: string; description: string | null; vision: string | null } }) {
  const id = p?.id ?? "new";
  return (
    <ActionForm action={saveProduct} submit={p ? "Save product" : "Add product"} reset={!p} className="flex flex-col gap-3">
      {p && <input type="hidden" name="id" value={p.id} />}
      <div>
        <label className="label" htmlFor={`pn-${id}`}>Name</label>
        <input id={`pn-${id}`} name="name" className="field" required defaultValue={p?.name} placeholder="e.g. Study app" />
      </div>
      <div>
        <label className="label" htmlFor={`pv-${id}`}>Product vision</label>
        <input id={`pv-${id}`} name="vision" className="field" defaultValue={p?.vision ?? ""} placeholder="What this product becomes for its users" />
      </div>
      <div>
        <label className="label" htmlFor={`pd-${id}`}>Description</label>
        <textarea id={`pd-${id}`} name="description" className="field min-h-16" defaultValue={p?.description ?? ""} />
      </div>
    </ActionForm>
  );
}

function KpiFields({ productId, k }: { productId: string; k?: { id: string; name: string; unit: string | null; baseline: number | null; current: number | null; target: number | null; dueDate: Date | null } }) {
  const id = k?.id ?? `new-${productId}`;
  return (
    <ActionForm action={saveKpi} submit={k ? "Save" : "Add KPI"} reset={!k} submitClass="btn-quiet btn-sm" className="grid gap-2 sm:grid-cols-3">
      <input type="hidden" name="productId" value={productId} />
      {k && <input type="hidden" name="id" value={k.id} />}
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`kn-${id}`}>KPI</label>
        <input id={`kn-${id}`} name="name" className="field" required defaultValue={k?.name} placeholder="e.g. Weekly active students" />
      </div>
      <div>
        <label className="label" htmlFor={`ku-${id}`}>Unit</label>
        <input id={`ku-${id}`} name="unit" className="field" defaultValue={k?.unit ?? ""} placeholder="%, users, ₦" />
      </div>
      <div>
        <label className="label" htmlFor={`kb-${id}`}>Baseline</label>
        <input id={`kb-${id}`} name="baseline" className="field" inputMode="decimal" defaultValue={k?.baseline ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`kc-${id}`}>Current</label>
        <input id={`kc-${id}`} name="current" className="field" inputMode="decimal" defaultValue={k?.current ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`kt-${id}`}>Target</label>
        <input id={`kt-${id}`} name="target" className="field" inputMode="decimal" defaultValue={k?.target ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`kd-${id}`}>Due</label>
        <input id={`kd-${id}`} name="dueDate" type="date" className="field" defaultValue={dateInput(k?.dueDate)} />
      </div>
    </ActionForm>
  );
}
