import Link from "next/link";
import Logo from "@/components/Logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-6 sm:px-12">
        <Link href="/" className="self-start">
          <Logo />
        </Link>
        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">{children}</div>
        <p className="text-xs text-subtle">
          <Link href="/privacy" className="hover:underline">Privacy</Link> · <Link href="/terms" className="hover:underline">Terms</Link>
        </p>
      </div>
      <div className="relative hidden overflow-hidden bg-ink lg:block">
        <div aria-hidden className="absolute -top-24 -right-24 size-[520px] rounded-full bg-accent/40 blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 -left-20 size-[460px] rounded-full bg-[#5b7cff]/25 blur-3xl" />
        <div className="relative flex h-full flex-col justify-end gap-6 p-14 text-white">
          <p className="eyebrow text-white/60">From strategy to outcome</p>
          <p className="display text-6xl leading-[0.98]">
            Know what to build.
            <br />
            <em className="text-white/75">And whether it worked.</em>
          </p>
          <div className="flex max-w-md flex-col gap-3">
            {[
              ["Strategy", "Vision, pillars, objectives and OKRs in one tree"],
              ["Ideas", "Every request evaluated against your goals, with reasons"],
              ["Roadmap", "Approved ideas become initiatives with owners and milestones"],
              ["AI agents", "Drafts for you to approve. Nothing changes without you"],
            ].map(([t, d]) => (
              <div key={t} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur">
                <span className="mt-1 size-2 shrink-0 rounded-full bg-[#5b7cff]" />
                <p className="text-sm">
                  <b>{t}.</b> <span className="text-white/70">{d}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
