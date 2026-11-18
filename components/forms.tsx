"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import type { Result } from "@/lib/result";

// Forms that run a server action and show what happened, in one place.

// React clears a form after its action runs, even when the action returns an error, so
// people would lose what they typed. Submitting through onSubmit keeps the fields; forms
// that should clear (adding items) reset themselves on success.
export function keepFields(run: (fd: FormData) => void) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => run(fd));
  };
}

export function ActionForm({
  action,
  children,
  submit = "Save",
  pending = "Saving…",
  className = "flex flex-col gap-4",
  reset = false,
  submitClass = "btn-primary",
  footer,
}: {
  action: (prev: Result, fd: FormData) => Promise<Result>;
  children: React.ReactNode;
  submit?: React.ReactNode;
  pending?: string;
  className?: string;
  reset?: boolean;
  submitClass?: string;
  footer?: React.ReactNode;
}) {
  const [state, run, isPending] = useActionState<Result, FormData>(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (reset && state?.ok) ref.current?.reset();
  }, [state, reset]);
  return (
    <form ref={ref} onSubmit={keepFields(run)} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className={submitClass} disabled={isPending}>
          {isPending ? pending : submit}
        </button>
        {footer}
        <FormMessage state={state} />
      </div>
    </form>
  );
}

export function FormMessage({ state }: { state: Result }) {
  if (!state) return null;
  if (state.error)
    return (
      <span role="alert" className="text-xs font-semibold text-bad">
        {state.error}
      </span>
    );
  if (state.ok)
    return (
      <span role="status" className="text-xs font-semibold text-good">
        {state.ok}
      </span>
    );
  return null;
}

export function SubmitButton({ children, className = "btn-primary", pending = "Working…" }: { children: React.ReactNode; className?: string; pending?: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <button className={className} disabled={isPending}>
      {isPending ? pending : children}
    </button>
  );
}

// A button that runs a server action (no form fields) and shows the result beside it.
export function ActionButton({
  action,
  children,
  className = "btn-quiet",
  pending = "Working…",
  confirm,
  showResult = true,
}: {
  action: () => Promise<Result>;
  children: React.ReactNode;
  className?: string;
  pending?: string;
  confirm?: string;
  showResult?: boolean;
}) {
  const [isPending, start] = useTransition();
  const [result, setResult] = useState<Result>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={className}
        disabled={isPending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => setResult(await action()));
        }}
      >
        {isPending ? pending : children}
      </button>
      {showResult && <FormMessage state={result} />}
    </span>
  );
}

// A select that saves as soon as it changes (status pickers and the like).
export function AutoSelect({
  action,
  name,
  value,
  options,
  label,
  className = "field h-8 min-h-8 w-auto py-0 pr-7 text-xs font-semibold",
}: {
  action: (fd: FormData) => Promise<Result>;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  label: string;
  className?: string;
}) {
  const [isPending, start] = useTransition();
  const [result, setResult] = useState<Result>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <select
        aria-label={label}
        name={name}
        defaultValue={value}
        disabled={isPending}
        className={className}
        onChange={(e) => {
          const fd = new FormData();
          fd.set(name, e.target.value);
          start(async () => setResult(await action(fd)));
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {result?.error && <span className="text-xs font-semibold text-bad">{result.error}</span>}
    </span>
  );
}
