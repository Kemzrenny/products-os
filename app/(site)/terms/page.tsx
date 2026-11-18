export const metadata = { title: "Terms" };

export default function Terms() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-16 text-sm leading-relaxed text-ink-2 sm:px-8">
      <h1 className="display text-5xl text-ink">Terms</h1>
      <p className="text-xs text-muted">Last updated 18 November 2026. This is a starting draft and should be reviewed before launch.</p>
      <h2 className="text-base font-bold text-ink">Using Products OS</h2>
      <p>Products OS is offered free during early access. Keep your password safe and invite only people who should see your organisation&apos;s work.</p>
      <h2 className="text-base font-bold text-ink">Your content</h2>
      <p>What your team adds stays yours. We use it only to run the service for you.</p>
      <h2 className="text-base font-bold text-ink">AI output</h2>
      <p>Evaluations, rankings, PRDs, briefings and Copilot answers are drafts to help you decide. They can be wrong. Decisions remain with the people who approve them.</p>
      <h2 className="text-base font-bold text-ink">Changes</h2>
      <p>The service will change during early access. We&apos;ll tell admins about material changes before they take effect.</p>
    </article>
  );
}
