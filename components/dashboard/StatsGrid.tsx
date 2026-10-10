"use client";

import { useEffect, useState } from "react";

type DashboardMetrics = {
  tvlUsd: number | null;
  volume24hUsd: number | null;
  swapPercent: number | null;
  feePercent: number | null;
};

const metrics: {
  key: keyof DashboardMetrics;
  label: string;
  source: string;
  format: (value: number) => string;
}[] = [
  {
    key: "tvlUsd",
    label: "TVL",
    source: "Liquidité USD de la paire ZTC/WSOL · DexScreener",
    format: (value) =>
      new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value),
  },
  {
    key: "volume24hUsd",
    label: "Volume 24 h",
    source: "Volume 24 h de la paire ZTC/WSOL · DexScreener",
    format: (value) =>
      new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value),
  },
  {
    key: "swapPercent",
    label: "Swap %",
    source: "Aucune source de pourcentage de swaps fiable n’est configurée.",
    format: (value) =>
      `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} %`,
  },
  {
    key: "feePercent",
    label: "Fee %",
    source: "Taux de frais du pool lu sur son compte Solana ZingSwap.",
    format: (value) =>
      `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value)} %`,
  },
];

export default function StatsGrid() {
  const [selected, setSelected] = useState<keyof DashboardMetrics>("tvlUsd");
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/dashboard/metrics", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Métriques indisponibles");
        return response.json() as Promise<DashboardMetrics>;
      })
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) {
          setData({ tvlUsd: null, volume24hUsd: null, swapPercent: null, feePercent: null });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const metric = metrics.find(({ key }) => key === selected)!;
  const value = data?.[selected] ?? null;

  return (
    <section className="space-y-4" aria-label="Métriques ZingSwap">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelected(key)}
            aria-pressed={selected === key}
            className={`rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${selected === key ? "border-cyan-400 bg-cyan-500/15 text-cyan-300" : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5" aria-live="polite">
        <p className="text-sm text-zinc-400">{metric.label}</p>
        <p className="mt-2 text-3xl font-bold text-white">
          {loading ? "Chargement…" : value == null ? "Indisponible" : metric.format(value)}
        </p>
        <p className="mt-2 text-xs text-zinc-500">{metric.source}</p>
      </div>
    </section>
  );
}
