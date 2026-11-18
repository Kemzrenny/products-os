"use client";

import { useActionState, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { sendToCopilot } from "@/app/actions/agents";
import type { Result } from "@/lib/result";
import { keepFields } from "@/components/forms";

export default function CopilotComposer({ conversationId }: { conversationId?: string }) {
  const [state, run, pending] = useActionState<Result, FormData>(sendToCopilot, null);
  const q = useSearchParams().get("q") ?? "";
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} onSubmit={keepFields(run)} className="flex flex-col gap-2">
      {conversationId && <input type="hidden" name="conversationId" value={conversationId} />}
      <div className="flex items-end gap-2 rounded-2xl border border-line bg-card p-2 shadow-[var(--shadow-soft)] focus-within:border-accent focus-within:ring-4 focus-within:ring-accent-soft">
        <textarea
          key={q}
          name="question"
          required
          rows={2}
          defaultValue={q}
          disabled={pending}
          placeholder="Ask about your objectives, ideas, roadmap or decisions…"
          aria-label="Your question"
          className="max-h-48 min-h-11 flex-1 resize-y bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-subtle"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              form.current?.requestSubmit();
            }
          }}
        />
        <button className="btn-primary size-10 px-0" disabled={pending} aria-label="Send">
          <ArrowUp size={16} aria-hidden />
        </button>
      </div>
      <p className="text-[11px] text-subtle" role="status">
        {pending ? "Copilot is reading your workspace…" : state?.error ? <span className="font-semibold text-bad">{state.error}</span> : "Enter to send, Shift+Enter for a new line."}
      </p>
    </form>
  );
}
