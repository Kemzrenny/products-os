import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { fmtDate } from "@/lib/format";
import Markdown from "@/components/Markdown";
import Logo from "@/components/Logo";

export const metadata = { title: "Leadership briefing", robots: { index: false, follow: false } };

// A briefing shared by link, readable without an account.
export default async function SharedBriefing({ params }: PageProps<"/b/[token]">) {
  const { token } = await params;
  const b = await prisma.briefing.findUnique({ where: { shareToken: token }, include: { workspace: { include: { organisation: { select: { name: true } } } } } });
  if (!b) notFound();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-5 py-10 sm:py-16">
      <Logo />
      <header className="flex flex-col gap-2">
        <p className="eyebrow">{b.workspace.organisation.name} · {b.workspace.name}</p>
        <h1 className="display text-5xl">{b.title}</h1>
        <p className="text-xs text-muted">
          {fmtDate(b.periodStart)} to {fmtDate(b.periodEnd)}
        </p>
      </header>
      <article className="card p-6 sm:p-8">
        <Markdown text={b.body} className="text-[15px]" />
      </article>
      <p className="text-xs text-subtle">Prepared with Products OS. Drafted by AI and approved by the product team.</p>
    </main>
  );
}
