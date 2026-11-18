// Small display helpers, safe for server and client.

const TZ = "Africa/Lagos";

export function fmtDate(d: Date | string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts }).format(new Date(d));
}

export function fmtShort(d: Date | string | null | undefined) {
  return fmtDate(d, { day: "numeric", month: "short" });
}

export function timeAgo(d: Date | string) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 14) return `${days} d ago`;
  return fmtDate(d);
}

export function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "numeric", hourCycle: "h23" }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// For <input type="date"> values.
export function dateInput(d: Date | null | undefined) {
  if (!d) return "";
  return new Date(d).toISOString().slice(0, 10);
}

export function quarterOf(d: Date) {
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
