export const metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-16 text-sm leading-relaxed text-ink-2 sm:px-8">
      <h1 className="display text-5xl text-ink">Privacy</h1>
      <p className="text-xs text-muted">Last updated 18 November 2026. This is a starting draft and should be reviewed before launch.</p>
      <h2 className="text-base font-bold text-ink">What we keep</h2>
      <p>Your name, email and a securely hashed password. Everything your team adds to its workspace: strategy, products, KPIs, ideas, evidence, decisions, roadmap items, tasks, agent drafts and Copilot chats. A log of changes, so your team can see who did what.</p>
      <h2 className="text-base font-bold text-ink">How AI is used</h2>
      <p>When someone runs an evaluation, an agent or Copilot, the relevant workspace content is sent to Google&apos;s Gemini API to produce the answer. It is used only to answer that request. Agent output is saved as a draft that a person approves.</p>
      <h2 className="text-base font-bold text-ink">Who can see it</h2>
      <p>Only members of your organisation, according to their role. Briefings are visible to anyone with their share link, and only once an admin approves them.</p>
      <h2 className="text-base font-bold text-ink">Your choices</h2>
      <p>Admins can remove members, products, ideas and initiatives at any time. To delete your account or organisation, contact us.</p>
    </article>
  );
}
