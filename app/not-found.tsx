import Link from "next/link";
import Logo from "@/components/Logo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo />
      <h1 className="display text-5xl">
        Not here.
        <br />
        <em>Maybe it moved.</em>
      </h1>
      <p className="max-w-sm text-sm text-muted">The page doesn&apos;t exist, or it belongs to a workspace you&apos;re not in.</p>
      <Link href="/app" className="btn-primary">Back to the Command Centre</Link>
    </main>
  );
}
