import Logo from "@/components/Logo";

export const metadata = { title: "You're offline" };
export const dynamic = "force-static";

export default function Offline() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Logo />
      <h1 className="display text-5xl">
        You&apos;re offline.
        <br />
        <em>We&apos;ll be here.</em>
      </h1>
      <p className="max-w-sm text-sm text-muted">Products OS needs a connection to load your workspace. Check your signal and try again.</p>
      <a href="/app" className="btn-primary">Try again</a>
    </main>
  );
}
