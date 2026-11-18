// The Products OS mark: a loop from strategy to outcome, with the accent dot where the
// loop closes.
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="16" fill="#1f1f1f" />
      <path d="M45.5 24.2A15 15 0 1 0 47 32" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" />
      <circle cx="46.6" cy="18.4" r="4.6" fill="#5b7cff" />
    </svg>
  );
}

export default function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <Mark />
      <span className="text-[15px] font-extrabold tracking-[-0.02em]">Products OS</span>
    </span>
  );
}
