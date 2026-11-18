"use client";

import { useActionState } from "react";
import { keepFields } from "@/components/forms";
import Link from "next/link";
import { login, signup } from "@/app/actions/auth";
import type { Result } from "@/lib/result";

export default function AuthForm({ mode, invite, email, next }: { mode: "login" | "signup"; invite?: string; email?: string; next?: string }) {
  const [state, action, pending] = useActionState<Result, FormData>(mode === "login" ? login : signup, null);
  return (
    <form onSubmit={keepFields(action)} className="flex flex-col gap-4">
      {invite && <input type="hidden" name="invite" value={invite} />}
      {next && <input type="hidden" name="next" value={next} />}
      {mode === "signup" && (
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input className="field" id="name" name="name" autoComplete="name" required />
        </div>
      )}
      <div>
        <label className="label" htmlFor="email">Work email</label>
        <input className="field" id="email" name="email" type="email" autoComplete="email" defaultValue={email} readOnly={!!email} required />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input
          className="field"
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          minLength={mode === "signup" ? 8 : undefined}
          required
        />
        {mode === "signup" && <p className="hint">At least 8 characters.</p>}
      </div>
      {state?.error && (
        <p role="alert" className="rounded-xl bg-bad-soft px-3 py-2.5 text-sm font-medium text-bad">
          {state.error}
        </p>
      )}
      <button className="btn-primary mt-1 h-11 w-full" disabled={pending}>
        {pending ? "Please wait…" : mode === "login" ? "Sign in" : invite ? "Join your team" : "Create account"}
      </button>
      <p className="text-center text-sm text-muted">
        {mode === "login" ? (
          <>New to Products OS? <Link className="link" href="/signup">Start free</Link></>
        ) : (
          <>Already have an account? <Link className="link" href={invite ? `/login?next=/invite/${invite}` : "/login"}>Sign in</Link></>
        )}
      </p>
    </form>
  );
}
