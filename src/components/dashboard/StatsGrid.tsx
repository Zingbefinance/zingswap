"use client";

import { useEffect, useState } from "react";

type DashboardMetrics = {
  tvlUsd: number | null;
  volume24hUsd: number | null;
  swapPercent: number | null;
  feePercent: number | null;
  updatedAt: string;
};

const usd = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "USD",
  maximumSignificantDigits: 6,
});

export default function StatsGrid() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/dashboard/metrics", { cache: "no-store" });
        if (!response.ok) throw new Error("Métriques indisponibles");
        const result = await response.json() as DashboardMetrics;
        if (!cancelled) setMetrics(result);
      } catch {
        if (!cancelled) setMetrics(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  const value = (amount: number | null | undefined) =>
    loading ? "Chargement…" : amount != null && Number.isFinite(amount) ? usd.format(amount) : "Indisponible";
  const cards = [
    { label: "TVL du pool ZING/SOL", value: value(metrics?.tvlUsd), note: "Calculée à partir des réserves on-chain" },
    { label: "Volume 24 h · ZING/SOL", value: value(metrics?.volume24hUsd), note: "Données DexScreener" },
    { label: "Swaps 24 h", value: metrics?.swapPercent == null ? "Indisponible" : metrics.swapPercent.toLocaleString("fr-FR"), note: "Nombre réel non fourni par la source" },
    { label: "Frais du pool", value: metrics?.feePercent == null ? "Indisponible" : `${metrics.feePercent.toLocaleString("fr-FR")} %`, note: "Taux configuré on-chain" },
  ];

  return (
    <section aria-label="Métriques réelles du marché" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <div key={card.label} className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-white/50">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{card.value}</p>
          <p className="mt-1 text-xs text-zinc-500">{card.note}</p>
        </div>
      ))}
    </section>
  );
}
