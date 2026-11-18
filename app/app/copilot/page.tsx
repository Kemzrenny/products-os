import Link from "next/link";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { getCtx } from "@/lib/context";
import { prisma } from "@/lib/prisma";
import { timeAgo } from "@/lib/format";
import { AGENT } from "@/lib/labels";
import { aiConfigured } from "@/lib/gemini";
import { PageHeader, Chip, Notice, Avatar } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import Markdown from "@/components/Markdown";
import CopilotComposer from "@/components/app/CopilotComposer";
import { deleteConversation } from "@/app/actions/agents";
import type { Source } from "@/lib/agents";

export const metadata = { title: "Copilot" };

const PROMPTS = [
  "What's at risk this month, and why?",
  "Which objective has the least work behind it?",
  "Summarise what we decided in the last two weeks.",
  "Which open ideas best serve our top objective?",
];

export default async function CopilotPage({ searchParams }: PageProps<"/app/copilot">) {
  const ctx = await getCtx();
  const { c } = await searchParams;
  const conversations = await prisma.conversation.findMany({ where: { workspaceId: ctx.workspace.id, userId: ctx.user.id }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, updatedAt: true } });
  const current = typeof c === "string" ? await prisma.conversation.findFirst({ where: { id: c, workspaceId: ctx.workspace.id, userId: ctx.user.id }, include: { messages: { orderBy: { createdAt: "asc" } } } }) : null;

  return (
    <>
      <PageHeader crumbs={["AI workforce", "Copilot"]} title="Product Copilot" lead="Ask about your strategy, ideas, roadmap and decisions. Answers cite their sources. Copilot reads; it never changes anything.">
        <Link href="/app/copilot" className="btn-quiet"><Plus size={14} aria-hidden /> New chat</Link>
      </PageHeader>
      {!aiConfigured() && <Notice tone="amber">AI is off. Add a Gemini API key in Vercel to use Copilot.</Notice>}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Conversations" className="hidden flex-col gap-1 lg:flex">
          <p className="eyebrow px-2 pb-1 text-[10px]">Your chats</p>
          {conversations.length === 0 && <p className="px-2 text-xs text-muted">None yet.</p>}
          {conversations.map((cv) => (
            <Link key={cv.id} href={`/app/copilot?c=${cv.id}`} aria-current={cv.id === current?.id ? "page" : undefined} className={`rounded-xl px-3 py-2 text-xs hover:bg-bg-2 ${cv.id === current?.id ? "bg-bg-2 font-bold" : ""}`}>
              <span className="block truncate">{cv.title}</span>
              <span className="text-[10px] text-subtle">{timeAgo(cv.updatedAt)}</span>
            </Link>
          ))}
        </nav>

        <div className="card flex min-h-[60vh] flex-col">
          <div className="flex flex-1 flex-col gap-5 p-5 sm:p-6">
            {!current || current.messages.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-5 py-8 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent"><Sparkles size={22} aria-hidden /></span>
                <p className="display text-4xl">
                  What would you <em>like to know?</em>
                </p>
                <div className="flex max-w-xl flex-wrap justify-center gap-2">
                  {PROMPTS.map((p) => (
                    <Link key={p} href={`/app/copilot?q=${encodeURIComponent(p)}`} className="rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold shadow-[var(--shadow-soft)] hover:bg-field">
                      {p}
                    </Link>
                  ))}
                </div>
              </div>
            ) : (
              current.messages.map((m) => {
                const meta = m.sources as { list?: Source[]; suggestedAgent?: string } | null;
                return m.role === "user" ? (
                  <div key={m.id} className="flex justify-end gap-2.5">
                    <p className="max-w-[80%] rounded-2xl rounded-tr-md bg-ink px-4 py-2.5 text-sm text-white">{m.content}</p>
                    <Avatar name={ctx.user.name} size={28} />
                  </div>
                ) : (
                  <div key={m.id} className="flex gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Sparkles size={13} aria-hidden /></span>
                    <div className="flex max-w-[88%] flex-col gap-2 rounded-2xl rounded-tl-md bg-field px-4 py-3">
                      <Markdown text={m.content} />
                      {meta?.list && meta.list.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 border-t border-line pt-2">
                          {meta.list.map((s) => (
                            <Link key={`${s.type}-${s.id}`} href={s.href} className="rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold text-accent-ink shadow-[var(--shadow-soft)] hover:underline">
                              {s.type}: {s.label}
                            </Link>
                          ))}
                        </div>
                      )}
                      {meta?.suggestedAgent && meta.suggestedAgent !== "NONE" && (
                        <Link href="/app/agents" className="self-start">
                          <Chip tone="blue">Try the {AGENT[meta.suggestedAgent as keyof typeof AGENT]?.name ?? "agents"}</Chip>
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="border-t border-line p-4">
            <CopilotComposer conversationId={current?.id} />
            {current && (
              <div className="mt-2 flex justify-end">
                <ActionButton action={deleteConversation.bind(null, current.id)} className="btn-ghost btn-sm text-subtle" confirm="Delete this chat?" showResult={false}>
                  <Trash2 size={12} aria-hidden /> Delete chat
                </ActionButton>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
