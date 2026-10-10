"use client";

import { useMemo, useState } from "react";

export type MarketCandle = { time: number; open: number; high: number; low: number; close: number };

interface AnalyticsChartProps {
  data: MarketCandle[];
  loading: boolean;
  error: string | null;
  period: string;
  onPeriodChange: (period: string) => void;
}

const periods = ["24H", "7D", "30D", "180D"];
const numberFormat = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 7 });
const currencyFormat = (value: number) => `$${numberFormat.format(value)}`;

function formatTime(timestamp: number, period: string) {
  const date = new Date(timestamp * 1000);
  return period === "24H"
    ? date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

export default function AnalyticsChart({ data, loading, error, period, onPeriodChange }: AnalyticsChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const chart = useMemo(() => {
    if (!data.length) return null;
    const width = 1000;
    const height = 300;
    const pad = { top: 12, right: 16, bottom: 30, left: 8 };
    const values = data.flatMap((candle) => [candle.low, candle.high]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || Math.abs(max) * 0.02 || 1;
    const y = (value: number) => pad.top + ((max + span * 0.04 - value) / (span * 1.08)) * (height - pad.top - pad.bottom);
    const plotWidth = width - pad.left - pad.right;
    const step = plotWidth / data.length;
    return { width, height, pad, min, max, y, plotWidth, step };
  }, [data]);

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 md:p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">Historique du prix</h2>
          <p className="mt-1 text-sm text-zinc-400">Ouverture, plus haut, plus bas et clôture en USD</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Période de l’historique">
          {periods.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onPeriodChange(value)}
              aria-pressed={period === value}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${period === value ? "bg-cyan-500 text-black" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      <div className="relative h-[320px]">
        {loading ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-400" role="status">Chargement de l’historique…</div>
        ) : error ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/5 px-6 text-center text-sm text-amber-200" role="status">{error}</div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900/50 px-6 text-center text-sm text-zinc-400">Aucune série historique n’est disponible pour cette paire et cette période.</div>
        ) : (
          chart && <div className="relative h-full w-full overflow-hidden">
            {hovered != null && data[hovered] && <div className="pointer-events-none absolute left-3 top-2 z-10 rounded-lg border border-zinc-700 bg-zinc-950/95 px-3 py-2 text-xs text-zinc-200 shadow-xl">
              <p className="mb-1 text-zinc-400">{new Date(data[hovered].time * 1000).toLocaleString("fr-FR")}</p>
              <p>Ouverture <span className="font-medium text-white">{currencyFormat(data[hovered].open)}</span></p>
              <p>Plus haut <span className="font-medium text-white">{currencyFormat(data[hovered].high)}</span></p>
              <p>Plus bas <span className="font-medium text-white">{currencyFormat(data[hovered].low)}</span></p>
              <p>Clôture <span className="font-medium text-white">{currencyFormat(data[hovered].close)}</span></p>
            </div>}
            <svg viewBox={`0 0 ${chart.width} ${chart.height}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label="Graphique en bougies OHLC">
              {[0, 1, 2, 3, 4].map((tick) => {
                const value = chart.max - (chart.max - chart.min) * tick / 4;
                const y = chart.pad.top + tick * (chart.height - chart.pad.top - chart.pad.bottom) / 4;
                return <g key={tick}><line x1={chart.pad.left} x2={chart.width - chart.pad.right} y1={y} y2={y} stroke="#27272a" strokeDasharray="3 5" /><text x={chart.width - chart.pad.right} y={y - 4} textAnchor="end" fill="#a1a1aa" fontSize="12">{numberFormat.format(value)}</text></g>;
              })}
              {data.map((candle, index) => {
                const x = chart.pad.left + chart.step * (index + 0.5);
                const rising = candle.close > candle.open;
                const color = rising ? "#22c55e" : "#ef4444";
                const candleWidth = Math.max(2, Math.min(12, chart.step * 0.68));
                const bodyTop = Math.min(chart.y(candle.open), chart.y(candle.close));
                const bodyHeight = Math.max(1, Math.abs(chart.y(candle.open) - chart.y(candle.close)));
                return <g key={`${candle.time}-${index}`} onMouseEnter={() => setHovered(index)} onMouseLeave={() => setHovered(null)}>
                  <rect x={x - chart.step / 2} y={chart.pad.top} width={chart.step} height={chart.height - chart.pad.top - chart.pad.bottom} fill="transparent" />
                  <line x1={x} x2={x} y1={chart.y(candle.high)} y2={chart.y(candle.low)} stroke={color} strokeWidth="2" />
                  <rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} stroke={color} />
                </g>;
              })}
              <text x={chart.pad.left} y={chart.height - 6} fill="#71717a" fontSize="12">{formatTime(data[0].time, period)}</text>
              <text x={chart.width - chart.pad.right} y={chart.height - 6} textAnchor="end" fill="#71717a" fontSize="12">{formatTime(data[data.length - 1].time, period)}</text>
            </svg>
          </div>
        )}
      </div>
    </section>
  );
}
