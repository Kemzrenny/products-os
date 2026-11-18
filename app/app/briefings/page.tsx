import Link from "next/link";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { atLeast } from "@/lib/roles";
import { fmtDate } from "@/lib/format";
import { PageHeader, Section, Empty } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import CopyButton from "@/components/CopyButton";
import Markdown from "@/components/Markdown";
import { startBriefing } from "@/app/actions/agents";

export const metadata = { title: "Briefings" };

export default async function BriefingsPage({ searchParams }: PageProps<"/app/briefings">) {
  const ctx = await getCtx();
  const { id } = await searchParams;
  const briefings = await prisma.briefing.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, take: 30 });
  const pending = await prisma.draft.findFirst({ where: { workspaceId: ctx.workspace.id, kind: "BRIEFING", status: "PENDING" }, select: { id: true } });
  const current = briefings.find((b) => b.id === id) ?? briefings[0];

  return (
    <>
      <PageHeader crumbs={["AI workforce", "Briefings"]} title="Leadership briefings" lead="A weekly summary of objectives, risks and decisions. Drafted by AI every Monday morning, approved by an admin, shared by link.">
        {pending ? (
          <Link href={`/app/agents/drafts/${pending.id}`} className="btn-accent">Review this week&apos;s draft</Link>
        ) : (
          atLeast(ctx.role, "EDITOR") && (
            <ActionButton action={startBriefing} className="btn-primary" pending="Writing…">
              Draft a briefing now
            </ActionButton>
          )
        )}
      </PageHeader>

      {!current ? (
        <div className="card">
          <Empty title="No briefings yet">Draft one now, or wait for Monday&apos;s automatic draft.</Empty>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <nav aria-label="Briefings" className="flex flex-col gap-1">
            {briefings.map((b) => (
              <Link key={b.id} href={`/app/briefings?id=${b.id}`} aria-current={b.id === current.id ? "page" : undefined} className={`rounded-xl px-3 py-2 text-xs hover:bg-bg-2 ${b.id === current.id ? "bg-bg-2 font-bold" : ""}`}>
                <span className="block truncate">{b.title}</span>
                <span className="text-[10px] text-subtle">{fmtDate(b.createdAt)}</span>
              </Link>
            ))}
          </nav>
          <Section title={current.title} action={<CopyButton text={`/b/${current.shareToken}`} label="Copy share link" />}>
            <p className="mb-4 text-xs text-muted">
              {fmtDate(current.periodStart)} to {fmtDate(current.periodEnd)} · anyone with the link can read it
            </p>
            <Markdown text={current.body} />
          </Section>
        </div>
      )}
    </>
  );
}
