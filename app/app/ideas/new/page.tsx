import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { atLeast } from "@/lib/roles";
import { EFFORT } from "@/lib/labels";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import { submitIdea } from "@/app/actions/ideas";

export const metadata = { title: "Submit an idea" };

const SOURCES = ["CEO / leadership", "Customer", "Sales", "Support", "Product team", "Design", "Engineering", "Marketing", "Data / analytics", "Other"];

export default async function NewIdea() {
  const ctx = await getCtx();
  const products = await prisma.product.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  return (
    <>
      <PageHeader crumbs={["Ideas", "New"]} title="Submit an idea" lead="Only the title is required. The more you say about the problem and the evidence, the better the evaluation." />
      <div className="card max-w-3xl p-5 sm:p-7">
        <ActionForm action={submitIdea} submit="Submit idea" pending="Submitting…" className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="title">Idea</label>
            <input id="title" name="title" className="field" required placeholder="e.g. Let students pay for subscriptions from their wallet" />
          </div>
          <div>
            <label className="label" htmlFor="productId">Product</label>
            <select id="productId" name="productId" className="field">
              <option value="">Not sure / several</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="source">Where it came from</label>
            <select id="source" name="source" className="field">
              <option value="">Choose…</option>
              {SOURCES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="requester">Requested by <span className="font-normal text-muted">(optional)</span></label>
            <input id="requester" name="requester" className="field" placeholder="e.g. Peter (CEO), or a customer's name" />
          </div>

          <fieldset className="flex flex-col gap-4 rounded-2xl bg-field p-4 sm:col-span-2">
            <legend className="eyebrow px-1">The customer problem</legend>
            <div>
              <label className="label" htmlFor="problemWho">Who has the problem?</label>
              <input id="problemWho" name="problemWho" className="field" placeholder="e.g. Students on monthly plans" />
            </div>
            <div>
              <label className="label" htmlFor="problemWhat">What is the problem?</label>
              <textarea id="problemWhat" name="problemWhat" className="field min-h-20" placeholder="e.g. Card payments fail for 1 in 4 students, so they drop off at checkout." />
            </div>
            <div>
              <label className="label" htmlFor="problemWhy">Why does it matter now?</label>
              <input id="problemWhy" name="problemWhy" className="field" placeholder="e.g. Exam season starts in March" />
            </div>
          </fieldset>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="description">Anything else</label>
            <textarea id="description" name="description" className="field min-h-20" placeholder="Context, links, the solution people have in mind…" />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor="evidence">One piece of evidence <span className="font-normal text-muted">(optional)</span></label>
            <textarea id="evidence" name="evidence" className="field min-h-16" placeholder="A customer quote, a number, a support ticket…" />
          </div>
          <div>
            <label className="label" htmlFor="evidenceSource">Evidence source</label>
            <input id="evidenceSource" name="evidenceSource" className="field" placeholder="e.g. Intercom, 14 Nov" />
          </div>
          {atLeast(ctx.role, "CONTRIBUTOR") && (
            <div>
              <label className="label" htmlFor="effort">Effort estimate</label>
              <select id="effort" name="effort" className="field">
                <option value="">Not estimated</option>
                {Object.entries(EFFORT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          )}
        </ActionForm>
      </div>
    </>
  );
}
