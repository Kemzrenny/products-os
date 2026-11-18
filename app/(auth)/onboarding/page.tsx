import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ActionForm } from "@/components/forms";
import { createOrganisation } from "@/app/actions/org";

export const metadata = { title: "Set up your organisation" };

export default async function Onboarding() {
  const user = await currentUser();
  const hasOrg = await prisma.member.findFirst({ where: { userId: user.id }, include: { organisation: { include: { workspaces: { take: 1 } } } } });
  if (hasOrg?.organisation.workspaces.length) redirect("/app");
  return (
    <>
      <p className="eyebrow mb-3">Step 1 of 2</p>
      <h1 className="display mb-2 text-5xl">
        Set up your <em>organisation.</em>
      </h1>
      <p className="mb-8 text-sm text-muted">Hi {user.name.split(" ")[0]}. You&apos;ll be its admin. Next you&apos;ll add your strategy.</p>
      <ActionForm action={createOrganisation} submit="Create organisation" pending="Setting up…" submitClass="btn-primary h-11 w-full">
        <div>
          <label className="label" htmlFor="org">Company name</label>
          <input className="field" id="org" name="org" required placeholder="e.g. Cubbes" />
        </div>
        <div>
          <label className="label" htmlFor="vision">Company vision <span className="font-normal text-muted">(optional)</span></label>
          <textarea className="field min-h-20" id="vision" name="vision" placeholder="Where the company is going, in a sentence or two." />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="workspace">Workspace</label>
            <input className="field" id="workspace" name="workspace" defaultValue="Product" />
            <p className="hint">A team or business unit.</p>
          </div>
          <div>
            <label className="label" htmlFor="product">First product <span className="font-normal text-muted">(optional)</span></label>
            <input className="field" id="product" name="product" placeholder="e.g. Study app" />
          </div>
        </div>
      </ActionForm>
    </>
  );
}
