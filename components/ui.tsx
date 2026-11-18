import Link from "next/link";
import type { Tone } from "@/lib/labels";
import { initials } from "@/lib/format";

const TONES: Record<Tone, string> = {
  grey: "bg-bg-2 text-ink-2",
  blue: "bg-accent-soft text-accent-ink",
  green: "bg-good-soft text-good",
  amber: "bg-warn-soft text-warn",
  red: "bg-bad-soft text-bad",
};

export function Chip({ tone = "grey", children, dot = true }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold whitespace-nowrap ${TONES[tone]}`}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function PageHeader({ crumbs, title, lead, children }: { crumbs?: string[]; title: React.ReactNode; lead?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        {crumbs && (
          <p className="text-[11.5px] font-medium text-subtle">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1.5">/</span>}
                {c}
              </span>
            ))}
          </p>
        )}
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em] sm:text-2xl">{title}</h1>
        {lead && <p className="max-w-2xl text-sm text-muted">{lead}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Section({ title, action, children, id, className = "" }: { title: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`card scroll-mt-24 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-bold">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, note, href, children }: { label: string; value: React.ReactNode; note?: React.ReactNode; href?: string; children?: React.ReactNode }) {
  const body = (
    <>
      <span className="text-xs font-semibold text-muted">{label}</span>
      <span className="text-[28px] leading-none font-extrabold tracking-[-0.03em]">{value}</span>
      {note && <span className="text-xs text-muted">{note}</span>}
      {children}
    </>
  );
  const cls = "card flex flex-col gap-2 p-5";
  return href ? (
    <Link href={href} className={`${cls} transition-shadow hover:shadow-[var(--shadow-float)]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Progress({ value, tone = "accent", label }: { value: number; tone?: "accent" | "good" | "warn" | "bad"; label?: string }) {
  const colour = { accent: "bg-accent", good: "bg-good", warn: "bg-[#d97a2b]", bad: "bg-bad" }[tone];
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-bg-2" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full rounded-full ${colour}`} style={{ width: `${v}%` }} />
      </div>
      <span className="w-9 text-right text-xs font-bold tabular-nums">{v}%</span>
    </div>
  );
}

export function Ring({ value, size = 44 }: { value: number; size?: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" role="img" aria-label={`${v}%`}>
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--bg-2)" strokeWidth="4" />
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 22 22)" />
      <text x="22" y="25.5" textAnchor="middle" fontSize="10" fontWeight="800" fill="var(--ink)">
        {v}%
      </text>
    </svg>
  );
}

export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return (
    <span
      title={name}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-accent-ink"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </span>
  );
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="display text-2xl">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "blue", children }: { tone?: Tone; children: React.ReactNode }) {
  return <div className={`rounded-xl px-4 py-3 text-sm ${TONES[tone]}`}>{children}</div>;
}
