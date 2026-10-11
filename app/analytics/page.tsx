"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BarChart3, Search } from "lucide-react";
import MainLayout from "@/components/layout/MainLayout";
import AnalyticsChart, { type MarketCandle } from "../components/AnalyticsChart";

type Pair = {
  address: string;
  tokenAddress: string;
  base: string;
  quote: string;
  priceUsd: string | null;
  liquidityUsd: number | null;
};

const currency = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const priceFormat = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 8 });

export default function ChartPage() {
  const [query, setQuery] = useState("ZTC");
  const [pairs, setPairs] = useState<Pair[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [period, setPeriod] = useState("24H");
  const [candles, setCandles] = useState<MarketCandle[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingCandles, setLoadingCandles] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const searchRequest = useRef(0);
  const candleRequest = useRef(0);

  async function searchToken(event?: FormEvent) {
    event?.preventDefault();
    const value = query.trim();
    if (!value) {
      setSearchError("Saisis un symbole ou une adresse Solana.");
      return;
    }

    const requestId = ++searchRequest.current;
    setSearching(true);
    setSearchError(null);
    setChartError(null);
    setPairs([]);
    setSelectedAddress("");
    setCandles([]);
    try {
      const response = await fetch(`/api/analytics?action=search&query=${encodeURIComponent(value)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "La recherche a échoué.");
      if (requestId !== searchRequest.current) return;
      const found = result.pairs as Pair[];
      setPairs(found);
      if (found.length === 0) setSearchError("Aucune paire Solana ou série historique n’est disponible pour cette recherche.");
      else setSelectedAddress(found[0].address);
    } catch (error) {
      if (requestId === searchRequest.current) {
        setSearchError(error instanceof Error ? error.message : "La recherche est indisponible.");
      }
    } finally {
      if (requestId === searchRequest.current) setSearching(false);
    }
  }

  useEffect(() => {
    const initialSearch = window.setTimeout(() => void searchToken(), 0);
    // Initial search only; later searches are submitted by the user.
    return () => window.clearTimeout(initialSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedAddress) return;
    const requestId = ++candleRequest.current;
    const controller = new AbortController();
    // The effect starts an external request and reflects its loading state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingCandles(true);
    setChartError(null);
    setCandles([]);

    const selected = pairs.find((pair) => pair.address === selectedAddress);
    if (!selected?.tokenAddress) {
      setChartError("L’adresse du token de cette paire est indisponible.");
      setLoadingCandles(false);
      return;
    }

    fetch(`/api/analytics?action=candles&pair=${encodeURIComponent(selectedAddress)}&token=${encodeURIComponent(selected.tokenAddress)}&period=${period}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Impossible de charger l’historique.");
        return result as { candles?: MarketCandle[]; error?: string };
      })
      .then((result) => {
        if (requestId !== candleRequest.current) return;
        setCandles(result.candles ?? []);
        setChartError(result.error ?? null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestId !== candleRequest.current) return;
        setChartError(error instanceof Error ? error.message : "Impossible de charger l’historique.");
      })
      .finally(() => {
        if (!controller.signal.aborted && requestId === candleRequest.current) setLoadingCandles(false);
      });

    return () => controller.abort();
  }, [selectedAddress, period, pairs]);

  const selectedPair = pairs.find((pair) => pair.address === selectedAddress) ?? null;

  return (
    <MainLayout>
      <div className="space-y-6">
        <header className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            <BarChart3 className="text-cyan-400" size={28} />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Graphique de marché</h1>
              <p className="mt-2 text-zinc-400">Rechercher un token Solana et consulter son historique de prix.</p>
            </div>
          </div>
        </header>

        <form onSubmit={searchToken} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-5">
          <label htmlFor="market-search" className="sr-only">Nom, symbole ou adresse mint du token</label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-zinc-900 px-4 py-3">
              <Search size={18} className="shrink-0 text-zinc-400" />
              <input
                id="market-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Nom, symbole ou adresse mint Solana"
                className="min-w-0 w-full bg-transparent text-white outline-none placeholder:text-zinc-500"
              />
            </div>
            <button type="submit" disabled={searching} className="flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-black transition hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-60">
              <Search size={18} />{searching ? "Recherche…" : "Rechercher"}
            </button>
          </div>
          {searchError && <p className="mt-3 text-sm text-amber-200" role="status">{searchError}</p>}
        </form>

        {pairs.length > 0 && selectedPair && (
          <>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm text-zinc-400">Paire sélectionnée</p>
                  <h2 className="mt-1 text-2xl font-bold text-white">{selectedPair.base}/{selectedPair.quote}</h2>
                </div>
                {pairs.length > 1 && (
                  <div className="w-full md:max-w-sm">
                    <label htmlFor="pair-select" className="mb-2 block text-sm text-zinc-400">Choisir une paire (classées par liquidité)</label>
                    <select id="pair-select" value={selectedAddress} onChange={(event) => setSelectedAddress(event.target.value)} className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-3 text-white">
                      {pairs.map((pair, index) => (
                        <option key={pair.address} value={pair.address}>
                          {`Paire ${index + 1} · ${pair.base}/${pair.quote} · ${pair.liquidityUsd ? currency.format(pair.liquidityUsd) : "liquidité indisponible"}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-zinc-900 p-4">
                  <p className="text-sm text-zinc-400">Prix indicatif actuel (USD)</p>
                  <p className="mt-2 text-xl font-semibold text-white">{selectedPair.priceUsd ? `$${priceFormat.format(Number(selectedPair.priceUsd))}` : "Indisponible"}</p>
                </div>
                <div className="rounded-xl bg-zinc-900 p-4">
                  <p className="text-sm text-zinc-400">Liquidité de la paire</p>
                  <p className="mt-2 text-xl font-semibold text-white">{selectedPair.liquidityUsd == null ? "Indisponible" : currency.format(selectedPair.liquidityUsd)}</p>
                </div>
              </div>
            </section>

            <AnalyticsChart data={candles} loading={loadingCandles} error={chartError} period={period} onPeriodChange={setPeriod} />
          </>
        )}

        {!searching && pairs.length === 0 && !searchError && (
          <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 p-12 text-center text-zinc-400">Recherche un token pour afficher son historique.</div>
        )}
      </div>
    </MainLayout>
  );
}
