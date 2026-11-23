"use client";

import { animate, motion } from "motion/react";
import { useEffect, useState } from "react";

const TONES = {
  brand: { text: "text-brand", glow: "bg-brand" },
  teal: { text: "text-teal", glow: "bg-teal" },
  warn: { text: "text-warn", glow: "bg-warn" },
  danger: { text: "text-danger", glow: "bg-danger" },
  violet: { text: "text-violet-400", glow: "bg-violet-500" },
};
export type Tone = keyof typeof TONES;

/** Number that counts up from 0. */
function CountUp({ value, currency }: { value: number; currency?: string }) {
  const [n, setN] = useState(0);
  useEffect(() => animate(0, value, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: setN }).stop, [value]);
  if (!currency) return <>{Math.round(n).toLocaleString()}</>;
  return <>{new Intl.NumberFormat("en", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n)}</>;
}

export function KpiCard({ label, value, hint, icon, tone, index, currency }: {
  label: string; value: number; hint: string; icon: React.ReactNode; tone: Tone; index: number; currency?: string;
}) {
  const t = TONES[tone];
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -4 }}
      transition={{ delay: index * 0.07, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="glass group relative overflow-hidden rounded-2xl p-5">
      <div className={`absolute -right-10 -top-10 size-28 rounded-full opacity-20 blur-2xl transition-opacity group-hover:opacity-40 ${t.glow}`} />
      <div className="relative flex items-center justify-between">
        <p className="text-sm text-slate-400">{label}</p>
        <span className={`grid size-8 place-items-center rounded-lg bg-white/5 ${t.text}`}>{icon}</span>
      </div>
      <p className="relative mt-3 font-display text-3xl font-semibold tabular-nums text-white">
        <CountUp value={value} currency={currency} />
      </p>
      <p className="relative mt-1 text-xs text-slate-500">{hint}</p>
    </motion.div>
  );
}

// Policy bands from blueprint 4.9 (tunable in Phase 2 settings).
const BANDS = [
  { max: 24, label: "Routine", color: "#20a99a" },
  { max: 49, label: "Review", color: "#3978f6" },
  { max: 74, label: "Priority", color: "#f5a524" },
  { max: 100, label: "Hold", color: "#f43f5e" },
];

/** Semicircle 0–100 gauge with an animated needle. */
export function RiskGauge({ score }: { score: number | null }) {
  const s = score ?? 0;
  const band = BANDS.find((b) => s <= b.max)!;
  const R = 80, C = Math.PI * R; // half-circle length
  const [angle, setAngle] = useState(-90);
  useEffect(() => animate(-90, -90 + (s / 100) * 180, { type: "spring", stiffness: 60, damping: 12, delay: 0.2, onUpdate: setAngle }).stop, [s]);
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 116" className="w-full max-w-[260px]" role="img" aria-label={`Average open risk score ${score ?? "none"}`}>
        <defs>
          <linearGradient id="gauge" x1="0" x2="1">
            {BANDS.map((b, i) => <stop key={b.label} offset={i / 3} stopColor={b.color} />)}
          </linearGradient>
        </defs>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgb(255 255 255 / .07)" strokeWidth="14" strokeLinecap="round" />
        <motion.path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#gauge)" strokeWidth="14" strokeLinecap="round"
          strokeDasharray={C} initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - s / 100) }}
          transition={{ duration: 1.6, ease: [0.16, 1, 0.3, 1] }} />
        <g transform={`rotate(${angle} 100 100)`}>
          <line x1="100" y1="100" x2="100" y2="34" stroke="white" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="7" fill="#0a1020" stroke="white" strokeWidth="2.5" />
      </svg>
      <p className="mt-3 font-display text-4xl font-semibold tabular-nums text-white">{score ?? "—"}</p>
      <p className="mt-1 text-sm font-medium" style={{ color: score == null ? "#64748b" : band.color }}>
        {score == null ? "No open invoices" : `${band.label} band`}
      </p>
      <div className="mt-4 flex gap-3 text-[11px] text-slate-500">
        {BANDS.map((b) => (
          <span key={b.label} className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ background: b.color }} />{b.label}</span>
        ))}
      </div>
    </div>
  );
}

export type TrendPoint = { week: string; invoices: number; avg_score: number | null; high_risk: number };

/** Bars = invoices per week, line = average risk score (0–100). */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (!data.length) {
    return <div className="grid h-56 place-items-center text-sm text-slate-500">No invoices yet. The trend appears after the first intake in Phase 1.</div>;
  }
  const W = 640, H = 220, P = 28;
  const maxInv = Math.max(...data.map((d) => d.invoices), 1);
  const step = (W - P * 2) / data.length;
  const x = (i: number) => P + step * i + step / 2;
  const yScore = (v: number) => H - P - (v / 100) * (H - P * 2);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i)},${yScore(d.avg_score ?? 0)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full" role="img" aria-label="Weekly invoices and average risk score">
      <defs>
        <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3978f6" stopOpacity=".9" /><stop offset="1" stopColor="#3978f6" stopOpacity=".15" />
        </linearGradient>
      </defs>
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={P} x2={W - P} y1={yScore(v)} y2={yScore(v)} stroke="rgb(255 255 255 / .05)" />
          <text x={W - P + 6} y={yScore(v) + 3} fontSize="9" fill="#64748b">{v}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const h = (d.invoices / maxInv) * (H - P * 2);
        return (
          <g key={d.week}>
            <motion.rect x={x(i) - step * 0.28} width={step * 0.56} rx="5" fill="url(#bar)"
              initial={{ height: 0, y: H - P }} animate={{ height: h, y: H - P - h }}
              transition={{ delay: 0.1 + i * 0.05, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
              <title>{`${d.week}: ${d.invoices} invoices, ${d.high_risk} high-risk`}</title>
            </motion.rect>
            <text x={x(i)} y={H - 8} fontSize="9" textAnchor="middle" fill="#64748b">
              {new Date(d.week).toLocaleDateString("en", { month: "short", day: "numeric" })}
            </text>
          </g>
        );
      })}
      <motion.path d={line} fill="none" stroke="#f5a524" strokeWidth="2.5" strokeLinejoin="round"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.4, duration: 1.4, ease: "easeInOut" }} />
      {data.map((d, i) => (
        <motion.circle key={d.week} cx={x(i)} cy={yScore(d.avg_score ?? 0)} r="3.5" fill="#0a1020" stroke="#f5a524" strokeWidth="2"
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + i * 0.08 }} />
      ))}
    </svg>
  );
}
