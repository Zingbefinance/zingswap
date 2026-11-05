"use client";

import { useMemo } from "react";
import { ExternalLink } from "lucide-react";

const chartPeriods = ["24H", "7D", "30D", "180D"];
const dexIntervals: Record<string, string> = { "24H": "15", "7D": "60", "30D": "240", "180D": "1D" };

type DexScreenerChartProps = {
  pairAddress: string;
  pairName: string;
  period: string;
  onPeriodChange: (period: string) => void;
};

export default function DexScreenerChart({ pairAddress, pairName, period, onPeriodChange }: DexScreenerChartProps) {
  const pairIsValid = /^[1-9A-HJ-NP-Za-km-z]{20,64}$/.test(pairAddress);
  const chartUrl = useMemo(() => {
    if (!pairIsValid) return null;
    const params = new URLSearchParams({
      embed: "1",
      loadChartSettings: "0",
      theme: "dark",
      chartTheme: "dark",
      chartStyle: "1",
      chartType: "price",
      interval: dexIntervals[period] ?? "15",
      trades: "0",
      info: "0",
    });
    return `https://dexscreener.com/solana/${encodeURIComponent(pairAddress)}?${params.toString()}`;
  }, [pairAddress, pairIsValid, period]);

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-5">
        <div>
          <h2 className="font-semibold text-white">Graphique · {pairName}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Graphique live DexScreener</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-zinc-900 p-1" aria-label="Période du graphique">
            {chartPeriods.map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => onPeriodChange(value)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${period === value ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}>{value}</button>)}
          </div>
          {chartUrl && <a href={`https://dexscreener.com/solana/${encodeURIComponent(pairAddress)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-2 text-xs text-zinc-300 hover:border-cyan-600 hover:text-white"><ExternalLink size={13} /> Ouvrir</a>}
        </div>
      </header>
      {chartUrl
        ? <iframe key={`${pairAddress}-${period}`} title={`Graphique DexScreener ${pairName}`} src={chartUrl} className="h-[420px] w-full border-0 bg-[#0b0e11] sm:h-[520px]" loading="lazy" referrerPolicy="no-referrer" allow="clipboard-write" />
        : <div className="flex h-[420px] items-center justify-center p-6 text-center text-sm text-zinc-400">Cette paire n’a pas d’adresse de marché valide pour afficher le graphique DexScreener.</div>}
    </section>
  );
}
