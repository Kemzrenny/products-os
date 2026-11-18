import Link from "next/link";
import { Target, Lightbulb, LineChart } from "lucide-react";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { timeAgo } from "@/lib/format";
import { PageHeader, Section, Chip, Notice } from "@/components/ui";
import ImportWizard from "@/components/import/ImportWizard";

export const metadata = { title: "Import" };

export default async function ImportPage({ searchParams }: PageProps<"/app/import">) {
  const ctx = await getCtx("ADMIN");
  const { welcome, mode } = await searchParams;
  const jobs = await prisma.importJob.findMany({ where: { workspaceId: ctx.workspace.id }, orderBy: { createdAt: "desc" }, take: 10, include: { createdBy: { select: { name: true } } } });

  return (
    <>
      <PageHeader
        crumbs={["Strategy", "Import"]}
        title="Bring in your existing work"
        lead="Halfway through the quarter? Import your OKRs with the progress you've already made, your request log, and your weekly trackers. You review everything before it's saved."
      >
        {welcome && <Link href="/app/strategy" className="btn-ghost">Skip, start from scratch</Link>}
      </PageHeader>

      {welcome && <Notice tone="blue"><b>Your organisation is ready.</b> If your OKRs live in a spreadsheet or a doc, bring them in here so you start with this quarter&apos;s real progress, not a blank page.</Notice>}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [Target, "OKRs", "Objectives, key results, starting, current and target values, leads, due dates and updates. Each key result's plan can become a roadmap initiative."],
          [Lightbulb, "Requests & feedback", "A request or complaint log. Each row becomes an idea; ones already resolved come in as decisions, not to be re-judged."],
          [LineChart, "Weekly trackers", "Weekly actuals become dated progress readings on a key result or KPI, so the trend since the start of the quarter isn't lost."],
        ].map(([Icon, t, d]) => {
          const I = Icon as typeof Target;
          return (
            <div key={t as string} className="card flex flex-col gap-1.5 p-4">
              <I size={16} aria-hidden className="text-accent" />
              <p className="text-sm font-extrabold">{t as string}</p>
              <p className="text-xs text-muted">{d as string}</p>
            </div>
          );
        })}
      </div>

      <ImportWizard defaultMode={mode === "paste" ? "paste" : "file"} />

      {jobs.length > 0 && (
        <Section title="Recent imports">
          <ul className="flex flex-col divide-y divide-line">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <Chip tone={j.status === "APPLIED" ? "green" : j.status === "PENDING" ? "amber" : "grey"}>{j.status === "APPLIED" ? "Imported" : j.status === "PENDING" ? "Waiting for review" : "Discarded"}</Chip>
                <span className="min-w-0 flex-1 text-xs">
                  <b>{j.fileName}{j.sheetName ? ` › ${j.sheetName}` : ""}</b>
                  <span className="block text-muted">{j.summary} · {j.createdBy.name} · {timeAgo(j.createdAt)}</span>
                </span>
                {j.status === "PENDING" && <Link href={`/app/import/${j.id}`} className="btn-quiet btn-sm">Review</Link>}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
