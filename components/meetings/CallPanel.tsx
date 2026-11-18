"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Video, RotateCw } from "lucide-react";
import type { Result } from "@/lib/result";

type Speaker = { name: string; done: number; pending: number; failed: number };

// For in-app calls: join, see whose audio has arrived, then write the notes.
export default function CallPanel({
  meetingId,
  ended,
  started,
  speakers,
  finish,
  endCall,
  reopen,
  canEdit,
}: {
  meetingId: string;
  ended: boolean;
  started: boolean;
  speakers: Speaker[];
  finish: (prev: Result, fd: FormData) => Promise<Result>;
  endCall: () => Promise<Result>;
  reopen: () => Promise<Result>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<Result>(null);
  const [skip, setSkip] = useState(false);
  const pendingParts = speakers.reduce((a, s) => a + s.pending, 0);
  const failed = speakers.reduce((a, s) => a + s.failed, 0);
  const done = speakers.reduce((a, s) => a + s.done, 0);
  const run = (fn: () => Promise<Result>) =>
    start(async () => {
      const res = await fn();
      setResult(res);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {!ended ? (
          <Link href={`/app/meetings/${meetingId}/call`} className="btn-primary">
            <Video size={15} aria-hidden /> {started ? "Join the call" : "Start the call"}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-muted">The call has ended.</span>
        )}
        {canEdit && started && !ended && (
          <button type="button" className="btn-quiet btn-sm" disabled={pending} onClick={() => window.confirm("End the call for everyone?") && run(endCall)}>
            End call for everyone
          </button>
        )}
        {canEdit && ended && (
          <button type="button" className="btn-quiet btn-sm" disabled={pending} onClick={() => run(reopen)}>
            <RotateCw size={12} aria-hidden /> Reopen the call
          </button>
        )}
      </div>

      {speakers.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line">
          {speakers.map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <span className="font-semibold">{s.name}</span>
              <span className="text-xs text-muted">
                {s.done} part{s.done === 1 ? "" : "s"} transcribed
                {s.pending ? ` · ${s.pending} in progress` : ""}
                {s.failed ? ` · ${s.failed} failed` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canEdit && started && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={pending || !done}
            onClick={() =>
              run(() => {
                const fd = new FormData();
                if (skip) fd.append("skipFailed", "on");
                return finish(null, fd);
              })
            }
          >
            {pending ? "Writing the notes…" : "Write the notes"}
          </button>
          <button type="button" className="btn-quiet btn-sm" onClick={() => router.refresh()}>
            Refresh
          </button>
          {failed > 0 && (
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} /> Write notes without the {failed} failed part{failed === 1 ? "" : "s"}
            </label>
          )}
          {result?.error && <span className="text-sm text-bad">{result.error}</span>}
        </div>
      )}
      <p className="hint">
        {!done && started ? "Each person’s audio arrives in two-minute parts while they’re in the call, and their last part when they leave. " : ""}
        {pendingParts ? "Some parts are still being transcribed. " : ""}
        Write the notes once everyone has left, or end the call for everyone first.
      </p>
    </div>
  );
}
