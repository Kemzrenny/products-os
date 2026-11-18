import { Mark } from "@/components/Logo";

// A static picture of the Command Centre for the website. It is decoration, so it's hidden
// from screen readers; the copy around it says what it shows.
export default function AppPreview() {
  const nav = ["Command Centre", "Strategy", "Products & KPIs", "Ideas", "Decisions", "Roadmap", "Copilot", "Agents & drafts"];
  return (
    <div aria-hidden className="pointer-events-none select-none overflow-hidden rounded-[22px] border border-line bg-card text-left shadow-[var(--shadow-float)]">
      <div className="flex">
        <div className="hidden w-[180px] shrink-0 flex-col gap-3 border-r border-line p-3 sm:flex">
          <div className="flex items-center gap-2 px-1">
            <Mark size={20} />
            <span className="text-[11px] font-extrabold">Products OS</span>
          </div>
          <div className="rounded-lg border border-line px-2 py-1.5 text-[10px] font-bold">Cubbes <span className="block font-normal text-muted">Product</span></div>
          <div className="flex flex-col gap-0.5">
            {nav.map((n, i) => (
              <span key={n} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${i === 0 ? "bg-bg-2" : "text-ink-2"}`}>
                {n}
                {n === "Agents & drafts" && <span className="ml-1 rounded-full bg-accent px-1 text-[8px] text-white">2</span>}
              </span>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3 bg-bg p-4">
          <div>
            <p className="text-[9px] text-subtle">Pages / Command Centre / Overview</p>
            <p className="text-[15px] font-extrabold tracking-tight">Good morning, Joshua</p>
            <p className="text-[9px] text-muted">Monday, 16 November 2026 · Product</p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {[
              ["Objective progress", "64%"],
              ["Active initiatives", "9"],
              ["Need attention", "2"],
              ["Awaiting decision", "5"],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-line bg-card p-2.5">
                <p className="text-[8.5px] font-semibold text-muted">{l}</p>
                <p className={`text-lg font-extrabold ${l === "Need attention" ? "text-warn" : ""}`}>{v}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-2 md:grid-cols-[1.3fr_1fr]">
            <div className="rounded-xl border border-line bg-card p-3">
              <p className="mb-2 text-[10px] font-bold">Objective progress</p>
              {[
                ["Grow paying subscribers 40%", 72, "On track"],
                ["Cut week-1 churn to 20%", 41, "At risk"],
                ["Launch in two new countries", 18, "On track"],
              ].map(([t, v, s]) => (
                <div key={t as string} className="flex items-center gap-2 border-t border-line py-1.5 first:border-t-0">
                  <span className="w-[54%] truncate text-[9.5px] font-semibold">{t}</span>
                  <span className="h-1 flex-1 rounded-full bg-bg-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${v}%` }} /></span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${s === "At risk" ? "bg-warn-soft text-warn" : "bg-good-soft text-good"}`}>{s}</span>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-line bg-card p-3">
              <p className="mb-2 text-[10px] font-bold">Needs your decision</p>
              {[
                ["Subscription via wallet", "Build now", "good"],
                ["Offline study packs", "Explore", "warn"],
                ["Strategy review: 2 proposals", "Draft", "accent"],
              ].map(([t, c, tone]) => (
                <div key={t} className="flex items-center justify-between gap-2 border-t border-line py-1.5 first:border-t-0">
                  <span className="truncate text-[9.5px] font-semibold">{t}</span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold ${tone === "good" ? "bg-good-soft text-good" : tone === "warn" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-ink"}`}>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
