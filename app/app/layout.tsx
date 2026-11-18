import { prisma } from "@/lib/prisma";
import { getCtx } from "@/lib/context";
import { Sidebar, MobileNav, type NavProps } from "@/components/app/Nav";

// Agent runs (evaluations, PRDs, briefings) can take a while.
export const maxDuration = 120;

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const ctx = await getCtx();
  const [drafts, ideas] = await Promise.all([
    prisma.draft.count({ where: { workspaceId: ctx.workspace.id, status: "PENDING" } }),
    prisma.idea.count({ where: { workspaceId: ctx.workspace.id, status: { in: ["NEW", "EVALUATED"] } } }),
  ]);
  const nav: NavProps = {
    user: { name: ctx.user.name, email: ctx.user.email },
    role: ctx.role,
    org: { id: ctx.org.id, name: ctx.org.name },
    orgs: ctx.orgs,
    workspace: { id: ctx.workspace.id, name: ctx.workspace.name },
    workspaces: ctx.workspaces,
    badges: { drafts, ideas },
  };
  return (
    <div className="flex min-h-dvh bg-bg">
      <Sidebar {...nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileNav {...nav} />
        <main className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col gap-6 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-8 lg:pb-12">{children}</main>
      </div>
    </div>
  );
}
