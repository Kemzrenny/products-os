import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { readSession } from "@/lib/auth";
import AuthForm from "@/components/AuthForm";
import { ActionForm } from "@/components/forms";
import { acceptInvite } from "@/app/actions/auth";
import { ROLE_LABEL } from "@/lib/roles";

export const metadata = { title: "Join your team" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const invite = await prisma.invitation.findUnique({ where: { token }, include: { organisation: { select: { name: true } } } });
  if (!invite || invite.acceptedAt) {
    return (
      <>
        <h1 className="display mb-2 text-5xl">
          This link has <em>expired.</em>
        </h1>
        <p className="text-sm text-muted">Ask your admin to send you a new invite.</p>
      </>
    );
  }
  const user = await readSession();
  const hasAccount = !user && (await prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } }));
  return (
    <>
      <p className="eyebrow mb-3">You&apos;re invited</p>
      <h1 className="display mb-2 text-5xl">
        Join <em>{invite.organisation.name}.</em>
      </h1>
      <p className="mb-8 text-sm text-muted">
        You&apos;ll join as <b>{ROLE_LABEL[invite.role]}</b> with {invite.email}.
      </p>
      {user ? (
        <ActionForm action={acceptInvite} submit={`Join ${invite.organisation.name}`} pending="Joining…">
          <input type="hidden" name="invite" value={token} />
          <p className="text-sm text-muted">Signed in as {user.email}.</p>
        </ActionForm>
      ) : hasAccount ? (
        <p className="text-sm">
          You already have an account. <Link className="link" href={`/login?next=/invite/${token}`}>Sign in to accept</Link>
        </p>
      ) : (
        <AuthForm mode="signup" invite={token} email={invite.email} />
      )}
    </>
  );
}
