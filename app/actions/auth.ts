"use server";

import bcrypt from "bcryptjs";
import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { ORG_COOKIE, WS_COOKIE } from "@/lib/context";
import type { Result } from "@/lib/result";

async function ip() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

const safeNext = (v: FormDataEntryValue | null) => (typeof v === "string" && v.startsWith("/") && !v.startsWith("//") ? v : "/app");

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export async function login(_: Result, form: FormData): Promise<Result> {
  if (!rateLimit(`login:${await ip()}`, 20, 15 * 60_000)) return { error: "Too many attempts. Wait a few minutes and try again." };
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return { error: "Incorrect email or password." };
  await setSessionCookie(user.id);
  redirect(safeNext(form.get("next")));
}

const signupSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(8, "Use at least 8 characters for your password.").max(200),
});

// Anyone can sign up and set up their own organisation. Someone arriving from an invite
// joins that organisation instead.
export async function signup(_: Result, form: FormData): Promise<Result> {
  if (!rateLimit(`signup:${await ip()}`, 10, 15 * 60_000)) return { error: "Too many attempts. Wait a few minutes and try again." };
  const parsed = signupSchema.safeParse({ name: form.get("name"), email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password } = parsed.data;
  if (await prisma.user.findUnique({ where: { email } })) return { error: "An account with this email already exists. Sign in instead." };

  const token = typeof form.get("invite") === "string" ? (form.get("invite") as string) : "";
  const invite = token ? await prisma.invitation.findUnique({ where: { token } }) : null;
  if (token && (!invite || invite.acceptedAt)) return { error: "This invite link has expired. Ask your admin for a new one." };
  if (invite && invite.email !== email) return { error: `This invite is for ${invite.email}. Sign up with that email.` };

  const user = await prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 10) } });
  if (invite) {
    await prisma.$transaction([
      prisma.member.create({ data: { organisationId: invite.organisationId, userId: user.id, role: invite.role } }),
      prisma.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    ]);
    (await cookies()).set(ORG_COOKIE, invite.organisationId, { path: "/", maxAge: 31536000, sameSite: "lax" });
  }
  await setSessionCookie(user.id);
  redirect(invite ? "/app" : "/onboarding");
}

// A signed-in person accepting an invite to another organisation.
export async function acceptInvite(_: Result, form: FormData): Promise<Result> {
  const { readSession } = await import("@/lib/auth");
  const user = await readSession();
  if (!user) return { error: "Sign in first." };
  const invite = await prisma.invitation.findUnique({ where: { token: String(form.get("invite") ?? "") } });
  if (!invite || invite.acceptedAt) return { error: "This invite link has expired." };
  if (invite.email !== user.email) return { error: `This invite is for ${invite.email}, but you're signed in as ${user.email}.` };
  await prisma.$transaction([
    prisma.member.upsert({
      where: { organisationId_userId: { organisationId: invite.organisationId, userId: user.id } },
      create: { organisationId: invite.organisationId, userId: user.id, role: invite.role },
      update: {},
    }),
    prisma.invitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
  ]);
  const store = await cookies();
  store.set(ORG_COOKIE, invite.organisationId, { path: "/", maxAge: 31536000, sameSite: "lax" });
  store.delete(WS_COOKIE);
  redirect("/app");
}

export async function logout() {
  await clearSessionCookie();
  redirect("/login");
}
