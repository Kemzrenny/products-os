import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AuthError } from "@/lib/auth";
import { AiError } from "@/lib/gemini";
import type { Result } from "@/lib/result";

export class UserError extends Error {}

// Runs a server action's work and turns any failure into a message the form can show.
export async function attempt(fn: () => Promise<string | void>): Promise<Result> {
  try {
    const ok = await fn();
    return { ok: ok ?? "Saved." };
  } catch (err) {
    unstable_rethrow(err);
    return { error: messageFor(err) };
  }
}

export function messageFor(err: unknown): string {
  if (err instanceof UserError || err instanceof AuthError || err instanceof AiError) return err.message;
  if (err instanceof ZodError) return err.issues[0]?.message ?? "Some details are missing.";
  if ((err as { code?: string })?.code === "P2025") return "That item no longer exists. Refresh the page.";
  console.error(err);
  return "Something went wrong. Please try again.";
}

// Form helpers.
export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;
export const optNum = (fd: FormData, k: string) => {
  const v = str(fd, k).replace(/,/g, "");
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new UserError(`"${v}" isn't a number.`);
  return n;
};
export const optDate = (fd: FormData, k: string) => {
  const v = str(fd, k);
  if (!v) return null;
  const d = new Date(`${v}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new UserError("That date doesn't look right.");
  return d;
};
export const ids = (fd: FormData, k: string) => fd.getAll(k).filter((v): v is string => typeof v === "string" && v.length > 0);

export function need(value: string, message: string) {
  if (!value) throw new UserError(message);
  return value;
}
