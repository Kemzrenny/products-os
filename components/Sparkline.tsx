import { fmtShort } from "@/lib/format";

// A small trend line of a key result's or KPI's readings, with the target as a dashed line.
export default function Sparkline({
  points,
  target,
  unit,
  width = 160,
  height = 40,
}: {
  points: { date: Date; value: number }[];
  target?: number | null;
  unit?: string | null;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;
  const xs = points.map((p) => p.date.getTime());
  const ys = points.map((p) => p.value);
  if (target != null) ys.push(target);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 4;
  const x = (t: number) => pad + ((t - minX) / (maxX - minX || 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - minY) / (maxY - minY || 1)) * (height - pad * 2);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(p.date.getTime()).toFixed(1)} ${y(p.value).toFixed(1)}`).join("");
  const last = points.at(-1)!;
  const first = points[0];
  const u = unit ?? "";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Trend from ${first.value}${u} on ${fmtShort(first.date)} to ${last.value}${u} on ${fmtShort(last.date)}${target != null ? `, target ${target}${u}` : ""}`} className="overflow-visible">
      {target != null && <line x1={pad} x2={width - pad} y1={y(target)} y2={y(target)} stroke="var(--line-2)" strokeDasharray="3 3" />}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <circle key={i} cx={x(p.date.getTime())} cy={y(p.value)} r={i === points.length - 1 ? 2.75 : 1.5} fill="var(--accent)">
          <title>{`${fmtShort(p.date)}: ${p.value}${u}`}</title>
        </circle>
      ))}
    </svg>
  );
}
