import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  Target,
  Lightbulb,
  Gavel,
  Map,
  Sparkles,
  ShieldCheck,
  LayoutDashboard,
  MessageSquareText,
  ListOrdered,
  FileText,
  Newspaper,
  Smartphone,
  Users,
  Check,
} from "lucide-react";
import AppPreview from "@/components/site/AppPreview";

export const metadata = { title: { absolute: "Products OS: build the right thing, and prove it worked" } };

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div aria-hidden className="absolute top-40 left-1/2 -z-10 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-6 px-5 pt-16 text-center sm:px-8 sm:pt-24">
          <p className="eyebrow inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-accent" /> The operating system for product leaders
          </p>
          <h1 className="display max-w-4xl text-[52px] sm:text-[76px] lg:text-[92px]">
            Build the right thing.
            <br />
            <em>Prove it worked.</em>
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted">
            Connect company goals to every idea, decision and roadmap item. AI agents do the legwork, you make the calls, and leadership sees it all in one place.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/signup" className="btn-primary h-11 px-5">
              Get started free <ArrowRight size={15} aria-hidden />
            </Link>
            <Link href="#how" className="btn-quiet h-11 px-5">
              <CalendarCheck size={15} aria-hidden /> See how it works
            </Link>
          </div>
        </div>

        <div className="relative mx-auto mt-14 max-w-[1080px] px-5 pb-20 sm:px-8">
          <AppPreview />
          <FloatCard className="float-a -top-6 left-0 hidden md:flex lg:-left-8" title="AI recommends" value="Build now" tone="good" note="Supports “Grow paying subscribers”" />
          <FloatCard className="float-b top-1/3 -right-2 hidden md:flex lg:-right-10" title="Strategic fit" value="86/100" tone="accent" note="Evidence: 14 customer quotes" />
          <FloatCard className="float-c -bottom-2 left-10 hidden md:flex" title="Weekly briefing" value="Ready to share" tone="ink" note="Drafted by AI · approved by you" />
        </div>
      </section>

      {/* Brand statement */}
      <section className="border-y border-line bg-card">
        <div className="mx-auto grid max-w-[1200px] items-center gap-8 px-5 py-16 sm:px-8 md:grid-cols-[1.2fr_1fr]">
          <h2 className="display text-5xl sm:text-6xl">
            For the people who decide
            <br />
            <em>what gets built.</em>
          </h2>
          <p className="text-[15px] leading-relaxed text-muted">
            You already have Jira, Linear, Figma, Notion and a dozen dashboards. None of them answers the CPO&apos;s questions: is this the right thing to build, does it serve our goals, and did it work? Products OS sits above your tools and answers them.
          </p>
        </div>
      </section>

      {/* Problems */}
      <section className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8">
        <p className="eyebrow mb-3">Less firefighting. More outcomes.</p>
        <h2 className="display mb-10 max-w-3xl text-5xl">
          Strategy shouldn&apos;t get lost <em>between the deck and the backlog.</em>
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["Everything is urgent", "Requests arrive from the CEO, sales, support and customers. Each has a reason. You need a fair, explainable way to say yes, not yet, or no."],
            ["The backlog drifts from the goals", "The company wants 40% more revenue; the backlog holds 30 unrelated tickets. Nobody can see which work serves which objective."],
            ["Shipping isn't impact", "Features launch and nobody checks if they moved anything. When the board asks about ROI, the answer lives in five tools and three meetings."],
          ].map(([t, d]) => (
            <div key={t} className="card p-6">
              <p className="mb-2 text-[17px] font-extrabold tracking-tight">{t}</p>
              <p className="text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 bg-ink text-white">
        <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8">
          <p className="eyebrow mb-3 text-white/60">Your journey with Products OS</p>
          <h2 className="display mb-12 max-w-3xl text-5xl sm:text-6xl">
            One loop, from goal <em className="text-white/70">to result.</em>
          </h2>
          <ol className="grid gap-4 md:grid-cols-4">
            {[
              [Target, "Set your strategy", "Vision, pillars, objectives and product OKRs in one connected tree. Versioned, so every decision keeps its context."],
              [Lightbulb, "Capture every idea", "Anyone can submit a request with the customer problem and evidence. No more ideas lost in Slack threads."],
              [Gavel, "Decide with AI", "Each idea is scored against your objectives with written reasons. You approve, defer or reject, and the reason is kept."],
              [Map, "Plan, ship, track", "Approved ideas become initiatives with owners, milestones and tasks. Progress rolls up to the objectives it serves."],
            ].map(([Icon, t, d], i) => {
              const I = Icon as typeof Target;
              return (
                <li key={t as string} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                  <span className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-white text-ink"><I size={18} aria-hidden /></span>
                    <span className="display text-3xl text-white/40">0{i + 1}</span>
                  </span>
                  <p className="text-[17px] font-extrabold">{t as string}</p>
                  <p className="text-sm leading-relaxed text-white/65">{d as string}</p>
                </li>
              );
            })}
          </ol>
          <div className="mt-10">
            <Link href="/signup" className="btn bg-white px-5 text-ink hover:bg-white/90">
              Create your workspace <ArrowRight size={15} aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Audiences */}
      <section id="teams" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-20 sm:px-8">
        <p className="eyebrow mb-3">Built for growing product teams</p>
        <h2 className="display mb-10 text-5xl">
          Different roles. <em>The same clarity.</em>
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ["CPOs and Heads of Product", "See every objective, initiative and risk in the Command Centre. Approve what matters. Share a weekly briefing instead of holding another status meeting.", ["Command Centre", "Approvals", "Leadership briefings"]],
            ["Product managers", "Turn requests into framed problems, get an explained evaluation, and draft PRDs in minutes, all tied to the objectives they serve.", ["AI evaluation", "PRD Agent", "Decision history"]],
            ["Founders and execs", "Submit ideas, see why they were or weren't prioritised, and read where the product stands without chasing anyone.", ["Idea intake", "Shared briefings", "Copilot"]],
          ].map(([t, d, tags]) => (
            <div key={t as string} className="card flex flex-col gap-4 p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><Users size={18} aria-hidden /></span>
              <p className="text-[17px] font-extrabold tracking-tight">{t as string}</p>
              <p className="flex-1 text-sm leading-relaxed text-muted">{d as string}</p>
              <div className="flex flex-wrap gap-1.5">
                {(tags as string[]).map((tag) => (
                  <span key={tag} className="rounded-full bg-bg-2 px-2.5 py-1 text-[11px] font-bold text-ink-2">{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Value props */}
      <section className="border-y border-line bg-card">
        <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8">
          <h2 className="display mb-12 max-w-3xl text-5xl">
            More than a roadmap. <em>A better way to decide.</em>
          </h2>
          <div className="grid gap-10 md:grid-cols-3">
            {[
              ["Every idea, judged fairly.", "Six ratings, each with a reason: alignment, customer impact, business impact, evidence, effort and risk. Weak evidence can never earn a “build now”."],
              ["Every decision, on record.", "Who decided, when, why, and what the AI recommended at the time. Searchable by objective and product, so precedent is one click away."],
              ["Every initiative, accountable.", "Nothing on the roadmap floats free. Unaligned work is flagged, at-risk items need a reason, and progress rolls up to your objectives."],
            ].map(([t, d]) => (
              <div key={t} className="flex flex-col gap-3 border-t-2 border-ink pt-5">
                <p className="display text-3xl">{t}</p>
                <p className="text-sm leading-relaxed text-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI office */}
      <section id="agents" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-20 sm:px-8">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.15fr]">
          <div className="flex flex-col gap-5 lg:sticky lg:top-28">
            <p className="eyebrow">Your AI product office</p>
            <h2 className="display text-5xl sm:text-6xl">
              Agents do the legwork.
              <br />
              <em>You make the calls.</em>
            </h2>
            <p className="text-[15px] leading-relaxed text-muted">
              Specialised agents read your whole workspace and draft real work. Every claim links to its source, and every draft waits for a person to approve it. Nothing changes without you.
            </p>
            <p className="inline-flex items-center gap-2 text-sm font-bold">
              <ShieldCheck size={17} aria-hidden className="text-good" /> Human approval on every change
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              [MessageSquareText, "Product Copilot", "Ask “what's at risk and why?” and get an answer that cites the objectives, ideas and decisions behind it."],
              [Target, "Strategy Agent", "Finds objectives with no work behind them and initiatives that serve no goal, then proposes what to do."],
              [ListOrdered, "Prioritisation Agent", "Evaluates every new idea against your strategy and ranks the open backlog with a reason for each place."],
              [FileText, "PRD Agent", "Drafts the PRD, user stories and acceptance criteria from the idea, its evidence and the objective it serves."],
              [Newspaper, "Weekly briefing", "Every Monday, a briefing on objectives, risks and decisions, ready for you to approve and share with the CEO."],
              [Sparkles, "Explained, not scored", "No mystery numbers. Every recommendation says why, which goals it serves, and what to find out first."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Target;
              return (
                <div key={t as string} className="card flex flex-col gap-2.5 p-5">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-ink text-white"><I size={16} aria-hidden /></span>
                  <p className="text-[15px] font-extrabold">{t as string}</p>
                  <p className="text-[13px] leading-relaxed text-muted">{d as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section id="features" className="scroll-mt-20 border-t border-line bg-card">
        <div className="mx-auto max-w-[1200px] px-5 py-20 sm:px-8">
          <p className="eyebrow mb-3">Six modules, one loop</p>
          <h2 className="display mb-10 text-5xl">
            Everything a CPO needs, <em>connected.</em>
          </h2>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
            {[
              [Users, "Organisation setup", "Organisations, workspaces, products and KPIs. Invite your team with four clear roles."],
              [Target, "Strategy management", "Vision, pillars, objectives, OKRs and the initiatives that serve them, in one tree."],
              [Lightbulb, "Ideas & prioritisation", "Capture, evidence, effort, AI evaluation, decisions and a full decision history."],
              [Map, "Product planning", "Now / Next / Later and a quarterly timeline, with owners, milestones and basic tasks."],
              [Sparkles, "AI workforce", "Copilot plus Strategy, Prioritisation and PRD agents, with sources and approvals."],
              [LayoutDashboard, "Command Centre", "Portfolio, objective progress, at-risk work, pending decisions and the AI briefing."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Target;
              return (
                <div key={t as string} className="flex flex-col gap-2 bg-card p-6">
                  <I size={18} aria-hidden className="text-accent" />
                  <p className="text-[15px] font-extrabold">{t as string}</p>
                  <p className="text-[13px] leading-relaxed text-muted">{d as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Install */}
      <section id="install" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-20 sm:px-8">
        <div className="card grid items-center gap-8 overflow-hidden p-8 sm:p-10 md:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-4">
            <span className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent"><Smartphone size={18} aria-hidden /></span>
            <h2 className="display text-4xl sm:text-5xl">
              In your pocket. <em>No app store.</em>
            </h2>
            <p className="text-[15px] leading-relaxed text-muted">Install Products OS on your phone or laptop straight from the browser. Approve a decision between meetings, submit an idea from a customer call, or check the Command Centre on the way in.</p>
            <ul className="flex flex-col gap-2 text-sm">
              {["Android and desktop: “Install app” in the menu", "iPhone: Share, then “Add to Home Screen”", "Opens straight into your workspace"].map((t) => (
                <li key={t} className="flex items-center gap-2"><Check size={15} aria-hidden className="text-good" /> {t}</li>
              ))}
            </ul>
          </div>
          <div aria-hidden className="mx-auto w-[220px] rounded-[34px] border-[6px] border-ink bg-bg p-3 shadow-[var(--shadow-float)]">
            <p className="text-[9px] text-subtle">Command Centre</p>
            <p className="mb-2 text-sm font-extrabold">Good morning, Joshua</p>
            {[["Grow paying subscribers", 72], ["Cut week-1 churn", 41], ["Launch in two countries", 18]].map(([t, v]) => (
              <div key={t as string} className="mb-1.5 rounded-xl border border-line bg-card p-2">
                <p className="truncate text-[9px] font-bold">{t}</p>
                <span className="mt-1 block h-1 rounded-full bg-bg-2"><span className="block h-full rounded-full bg-accent" style={{ width: `${v}%` }} /></span>
              </div>
            ))}
            <div className="mt-2 rounded-xl bg-ink p-2.5 text-white">
              <p className="text-[9px] font-bold">2 drafts need your approval</p>
              <p className="text-[8px] text-white/60">Strategy review · Weekly briefing</p>
            </div>
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="mx-auto flex max-w-[1200px] flex-col items-center gap-6 px-5 pb-24 text-center sm:px-8">
        <h2 className="display max-w-3xl text-6xl sm:text-7xl">
          Build the right thing.
          <br />
          <em>Prove it worked.</em>
        </h2>
        <p className="max-w-md text-[15px] text-muted">Set up your organisation in two minutes. Bring your strategy; we&apos;ll connect the rest.</p>
        <Link href="/signup" className="btn-primary h-11 px-6">
          Get started free <ArrowRight size={15} aria-hidden />
        </Link>
      </section>
    </>
  );
}

function FloatCard({ className, title, value, note, tone }: { className: string; title: string; value: string; note: string; tone: "good" | "accent" | "ink" }) {
  const dot = tone === "good" ? "bg-good" : tone === "accent" ? "bg-accent" : "bg-ink";
  return (
    <div aria-hidden className={`absolute z-10 w-56 flex-col gap-1 rounded-2xl border border-line bg-card p-3.5 shadow-[var(--shadow-float)] ${className}`}>
      <span className="flex items-center gap-1.5 text-[10.5px] font-semibold text-muted"><span className={`size-1.5 rounded-full ${dot}`} /> {title}</span>
      <span className="text-xl font-extrabold tracking-tight">{value}</span>
      <span className="text-[11px] text-muted">{note}</span>
    </div>
  );
}
