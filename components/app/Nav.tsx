"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Target,
  Package,
  Lightbulb,
  Gavel,
  Map,
  ListChecks,
  MessageSquareText,
  Bot,
  FileText,
  Settings,
  Menu,
  X,
  LogOut,
  ChevronsUpDown,
  Plus,
} from "lucide-react";
import Logo from "@/components/Logo";
import { Avatar } from "@/components/ui";
import InstallButton from "@/components/pwa/InstallButton";
import { logout } from "@/app/actions/auth";
import { switchWorkspace, switchOrg } from "@/app/actions/org";

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>; badge?: number };

export type NavProps = {
  user: { name: string; email: string };
  role: string;
  org: { id: string; name: string };
  orgs: { id: string; name: string }[];
  workspace: { id: string; name: string };
  workspaces: { id: string; name: string }[];
  badges: { drafts: number; ideas: number };
};

function groups(b: NavProps["badges"]): { title: string; items: Item[] }[] {
  return [
    {
      title: "Menu",
      items: [
        { href: "/app", label: "Command Centre", icon: LayoutDashboard },
        { href: "/app/strategy", label: "Strategy", icon: Target },
        { href: "/app/products", label: "Products & KPIs", icon: Package },
      ],
    },
    {
      title: "Ideas",
      items: [
        { href: "/app/ideas", label: "Ideas", icon: Lightbulb, badge: b.ideas },
        { href: "/app/decisions", label: "Decisions", icon: Gavel },
      ],
    },
    {
      title: "Planning",
      items: [
        { href: "/app/roadmap", label: "Roadmap", icon: Map },
        { href: "/app/tasks", label: "My tasks", icon: ListChecks },
      ],
    },
    {
      title: "AI workforce",
      items: [
        { href: "/app/copilot", label: "Copilot", icon: MessageSquareText },
        { href: "/app/agents", label: "Agents & drafts", icon: Bot, badge: b.drafts },
        { href: "/app/briefings", label: "Briefings", icon: FileText },
      ],
    },
  ];
}

function isActive(path: string, href: string) {
  if (href === "/app") return path === "/app";
  return path === href || path.startsWith(`${href}/`) || (href === "/app/roadmap" && path.startsWith("/app/initiatives"));
}

function Links({ badges, onNavigate }: { badges: NavProps["badges"]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-5" aria-label="Main">
      {groups(badges).map((g) => (
        <div key={g.title} className="flex flex-col gap-0.5">
          <p className="eyebrow px-3 pb-1.5 text-[10px]">{g.title}</p>
          {g.items.map((it) => {
            const active = isActive(path, it.href);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
                  active ? "bg-bg-2 text-ink" : "text-ink-2 hover:bg-bg-2/70"
                }`}
              >
                <Icon size={16} aria-hidden />
                <span className="flex-1">{it.label}</span>
                {!!it.badge && <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-white">{it.badge}</span>}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

function Switcher({ props }: { props: NavProps }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 rounded-xl border border-line bg-card px-2.5 py-2 text-left shadow-[var(--shadow-soft)] hover:bg-field"
      >
        <span className="flex size-8 items-center justify-center rounded-lg bg-ink text-xs font-bold text-white">{props.org.name.slice(0, 1).toUpperCase()}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold">{props.org.name}</span>
          <span className="block truncate text-[11px] text-muted">{props.workspace.name}</span>
        </span>
        <ChevronsUpDown size={14} aria-hidden className="text-muted" />
      </button>
      {open && (
        <div className="card absolute top-full right-0 left-0 z-50 mt-1.5 flex flex-col gap-1 p-2">
          <p className="eyebrow px-2 pt-1 text-[10px]">Workspaces</p>
          {props.workspaces.map((w) => (
            <form key={w.id} action={switchWorkspace}>
              <input type="hidden" name="workspace" value={w.id} />
              <button className={`w-full rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-bg-2 ${w.id === props.workspace.id ? "font-bold" : ""}`}>{w.name}</button>
            </form>
          ))}
          {props.role === "ADMIN" && (
            <Link href="/app/settings#workspaces" onClick={() => setOpen(false)} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-accent hover:bg-bg-2">
              <Plus size={13} aria-hidden /> New workspace
            </Link>
          )}
          {props.orgs.length > 1 && (
            <>
              <p className="eyebrow mt-1 border-t border-line px-2 pt-2 text-[10px]">Organisations</p>
              {props.orgs.map((o) => (
                <form key={o.id} action={switchOrg}>
                  <input type="hidden" name="org" value={o.id} />
                  <button className={`w-full rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-bg-2 ${o.id === props.org.id ? "font-bold" : ""}`}>{o.name}</button>
                </form>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Footer({ props, onNavigate }: { props: NavProps; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <Link href="/app/settings" onClick={onNavigate} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-ink-2 hover:bg-bg-2">
        <Settings size={16} aria-hidden /> Settings & team
      </Link>
      <div className="flex items-center gap-2.5 px-2">
        <Avatar name={props.user.name} size={30} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-bold">{props.user.name}</p>
          <p className="truncate text-[11px] text-muted capitalize">{props.role.toLowerCase()}</p>
        </div>
        <form action={logout}>
          <button className="rounded-lg p-2 text-muted hover:bg-bg-2 hover:text-ink" aria-label="Sign out" title="Sign out">
            <LogOut size={15} aria-hidden />
          </button>
        </form>
      </div>
    </div>
  );
}

export function Sidebar(props: NavProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-card px-3 py-4 lg:flex">
      <Link href="/app" className="px-2">
        <Logo />
      </Link>
      <Switcher props={props} />
      <div className="flex-1">
        <Links badges={props.badges} />
      </div>
      <div className="px-2">
        <InstallButton className="btn-quiet btn-sm w-full" />
      </div>
      <Footer props={props} />
    </aside>
  );
}

// Phones and the installed app: a top bar, a drawer for everything, and a bottom tab bar
// for the four places people go most.
export function MobileNav(props: NavProps) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
  }, [open]);
  const tabs = [
    { href: "/app", label: "Overview", icon: LayoutDashboard },
    { href: "/app/ideas", label: "Ideas", icon: Lightbulb },
    { href: "/app/roadmap", label: "Roadmap", icon: Map },
    { href: "/app/copilot", label: "Copilot", icon: MessageSquareText },
  ];
  return (
    <>
      <div className="pt-safe sticky top-0 z-40 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/app">
          <Logo />
        </Link>
        <button type="button" className="btn-quiet btn-sm" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu size={16} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <div className="pt-safe pb-safe absolute inset-y-0 right-0 flex w-[86%] max-w-[320px] flex-col gap-5 overflow-y-auto bg-card px-3 py-4 shadow-[var(--shadow-float)]">
            <div className="flex items-center justify-between px-2">
              <Logo />
              <button type="button" className="rounded-lg p-2 hover:bg-bg-2" onClick={() => setOpen(false)} aria-label="Close menu">
                <X size={18} aria-hidden />
              </button>
            </div>
            <Switcher props={props} />
            <div className="flex-1">
              <Links badges={props.badges} onNavigate={() => setOpen(false)} />
            </div>
            <div className="px-2">
              <InstallButton className="btn-quiet btn-sm w-full" />
            </div>
            <Footer props={props} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <nav aria-label="Quick" className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-card/95 backdrop-blur lg:hidden">
        <div className="grid grid-cols-4">
          {tabs.map((t) => {
            const active = isActive(path, t.href);
            const Icon = t.icon;
            return (
              <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-bold ${active ? "text-ink" : "text-subtle"}`}>
                <Icon size={19} aria-hidden />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
