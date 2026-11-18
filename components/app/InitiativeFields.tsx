import { dateInput } from "@/lib/format";

// The fields shared by "New initiative" and editing one.
export default function InitiativeFields({
  products,
  objectives,
  members,
  i,
}: {
  products: { id: string; name: string }[];
  objectives: { id: string; title: string }[];
  members: { id: string; name: string }[];
  i?: { id: string; title: string; description: string | null; productId: string | null; ownerId: string | null; horizon: string; startDate: Date | null; endDate: Date | null; objectiveIds: string[] };
}) {
  const p = i?.id ?? "new";
  return (
    <>
      {i && <input type="hidden" name="id" value={i.id} />}
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`it-${p}`}>Initiative</label>
        <input id={`it-${p}`} name="title" className="field" required defaultValue={i?.title} placeholder="e.g. Wallet subscriptions" />
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor={`id-${p}`}>Description</label>
        <textarea id={`id-${p}`} name="description" className="field min-h-20" defaultValue={i?.description ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor={`ip-${p}`}>Product</label>
        <select id={`ip-${p}`} name="productId" className="field" defaultValue={i?.productId ?? ""}>
          <option value="">None</option>
          {products.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`io-${p}`}>Owner</label>
        <select id={`io-${p}`} name="ownerId" className="field" defaultValue={i?.ownerId ?? ""}>
          <option value="">No owner</option>
          {members.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label" htmlFor={`ih-${p}`}>Horizon</label>
        <select id={`ih-${p}`} name="horizon" className="field" defaultValue={i?.horizon ?? "NEXT"}>
          <option value="NOW">Now</option>
          <option value="NEXT">Next</option>
          <option value="LATER">Later</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor={`is-${p}`}>Start</label>
          <input id={`is-${p}`} name="startDate" type="date" className="field" defaultValue={dateInput(i?.startDate)} />
        </div>
        <div>
          <label className="label" htmlFor={`ie-${p}`}>End</label>
          <input id={`ie-${p}`} name="endDate" type="date" className="field" defaultValue={dateInput(i?.endDate)} />
        </div>
      </div>
      <fieldset className="sm:col-span-2">
        <legend className="label">Serves objectives</legend>
        {objectives.length === 0 ? (
          <p className="text-xs text-muted">Add company objectives on the Strategy page first.</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {objectives.map((o) => (
              <label key={o.id} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-xs has-[:checked]:border-ink has-[:checked]:bg-field">
                <input type="checkbox" name="objectiveIds" value={o.id} defaultChecked={i?.objectiveIds.includes(o.id)} className="mt-0.5" />
                {o.title}
              </label>
            ))}
          </div>
        )}
      </fieldset>
    </>
  );
}
