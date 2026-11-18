import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Logo from "@/components/Logo";
import { readSession } from "@/lib/auth";
import SiteMenu from "@/components/site/SiteMenu";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#agents", label: "AI agents" },
  { href: "/#teams", label: "For teams" },
];

export default async function SiteLayout({ children }: LayoutProps<"/">) {
  const user = await readSession();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-safe sticky top-0 z-50 border-b border-transparent bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/70">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-5 py-4 sm:px-8">
          <Link href="/" aria-label="Products OS home">
            <Logo />
          </Link>
          <nav aria-label="Website" className="hidden items-center gap-7 md:flex">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="text-[13px] font-semibold text-ink-2 hover:text-ink">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Link href="/app" className="btn-primary">
                Dashboard <ArrowUpRight size={14} aria-hidden />
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn-ghost hidden sm:inline-flex">Sign in</Link>
                <Link href="/signup" className="btn-primary">Start free</Link>
              </>
            )}
            <SiteMenu links={LINKS} />
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-3">
            <Logo />
            <p className="max-w-xs text-sm text-muted">The strategy-to-outcome operating system for product teams.</p>
          </div>
          <FooterCol title="Product" links={[["How it works", "/#how"], ["Features", "/#features"], ["AI agents", "/#agents"], ["Install the app", "/#install"]]} />
          <FooterCol title="Get started" links={[["Start free", "/signup"], ["Sign in", "/login"]]} />
          <FooterCol title="Legal" links={[["Privacy", "/privacy"], ["Terms", "/terms"]]} />
        </div>
        <p className="mx-auto max-w-[1200px] px-5 pb-10 text-xs text-subtle sm:px-8">© {new Date().getFullYear()} Products OS. All rights reserved.</p>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs font-bold">{title}</p>
      {links.map(([label, href]) => (
        <Link key={href} href={href} className="text-sm text-muted hover:text-ink">
          {label}
        </Link>
      ))}
    </div>
  );
}
