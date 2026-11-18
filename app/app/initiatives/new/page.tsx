import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/forms";
import InitiativeFields from "@/components/app/InitiativeFields";
import { createInitiative } from "@/app/actions/planning";

export const metadata = { title: "New initiative" };

export default async function NewInitiative() {
  const ctx = await getCtx("EDITOR");
  const [products, objectives, members] = await Promise.all([
    prisma.product.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, name: true } }),
    prisma.objective.findMany({ where: { workspaceId: ctx.workspace.id }, select: { id: true, title: true }, orderBy: { createdAt: "asc" } }),
    prisma.member.findMany({ where: { organisationId: ctx.org.id }, select: { user: { select: { id: true, name: true } } } }),
  ]);
  return (
    <>
      <PageHeader crumbs={["Planning", "Roadmap", "New"]} title="New initiative" lead="Most initiatives come from approved ideas. Add one directly for strategic work that didn't start as an idea." />
      <div className="card max-w-3xl p-5 sm:p-7">
        <ActionForm action={createInitiative} submit="Add to roadmap" pending="Adding…" className="grid gap-4 sm:grid-cols-2">
          <InitiativeFields products={products} objectives={objectives} members={members.map((m) => m.user)} />
        </ActionForm>
      </div>
    </>
  );
}
