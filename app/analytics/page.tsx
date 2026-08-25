"use client";
import { searchFirstSolanaPair } from "@/lib/dexScreener";
import MainLayout from "@/components/layout/MainLayout";
import { BarChart3, Search, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";

type Pair = {
  baseToken: { symbol: string; name: string };
  quoteToken: { symbol: string };
  pairAddress: string;
  dexId: string;
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  url: string;
};

export default function ChartPage() {
  const [query, setQuery] = useState("ZTC");
  const [loading, setLoading] = useState(false);
  const [pair, setPair] = useState<Pair | null>(null);

  const searchToken = async (value: string) => {
  if (!value.trim()) return;

  setLoading(true);

  try {
    const solanaPair = await searchFirstSolanaPair(value);

    setPair(solanaPair);
  } catch (err) {
    console.error(err);
    setPair(null);
  } finally {
    setLoading(false);
  }
};

  useEffect(() => {
    searchToken("ZTC");
  }, []);

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* En-tête */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="text-cyan-400" size={28} />

            <div>
              <h1 className="text-3xl font-bold text-white">
                Graphique
              </h1>

              <p className="mt-2 text-zinc-400">
                Rechercher n'importe quel token Solana.
              </p>
            </div>
          </div>
        </div>

        {/* Recherche */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 space-y-4">
          <div className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-3">
            <Search size={18} className="text-zinc-400" />

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex : ZTC, BONK, JUP ou une adresse Solana"
              className="w-full bg-transparent text-white outline-none placeholder:text-zinc-500"
              onKeyDown={(e) => {
                if (e.key === "Enter") searchToken(query);
              }}
            />
          </div>

          <button
            onClick={() => searchToken(query)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-black transition hover:bg-cyan-400"
          >
            <Search size={18} />
            {loading ? "Recherche..." : "Rechercher"}
          </button>
        </div>

        {/* Résultat */}
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          {pair ? (
            <>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-zinc-400">Paire détectée</p>

                  <h2 className="text-2xl font-bold text-white">
                    {pair.baseToken.symbol}/{pair.quoteToken.symbol}
                  </h2>

                  <p className="mt-1 text-sm text-zinc-500">
                    DEX : {pair.dexId}
                  </p>
                </div>

                <button
                  onClick={() => window.open(pair.url, "_blank")}
                  className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-black transition hover:bg-cyan-400"
                >
                  <ExternalLink size={18} />
                  Ouvrir sur DexScreener
                </button>
              </div>

              {/* Graphique intégré */}
              <div className="mt-6 overflow-hidden rounded-2xl border border-zinc-800">
                <iframe
                  src={`https://dexscreener.com/solana/${pair.pairAddress}?embed=1&theme=dark`}
                  title="DexScreener Chart"
                  className="h-[520px] w-full border-0"
                  allowFullScreen
                />
              </div>

              {/* Statistiques */}
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-zinc-900 p-4">
                  <p className="text-zinc-400">Prix</p>

                  <p className="mt-2 text-2xl font-bold text-white">
                    {pair.priceUsd ? `$${pair.priceUsd}` : "--"}
                  </p>
                </div>

                <div className="rounded-xl bg-zinc-900 p-4">
                  <p className="text-zinc-400">Volume 24h</p>

                  <p className="mt-2 text-2xl font-bold text-white">
                    {pair.volume?.h24
                      ? `$${Math.round(pair.volume.h24).toLocaleString()}`
                      : "--"}
                  </p>
                </div>

                <div className="rounded-xl bg-zinc-900 p-4">
                  <p className="text-zinc-400">Liquidité</p>

                  <p className="mt-2 text-2xl font-bold text-white">
                    {pair.liquidity?.usd
                      ? `$${Math.round(pair.liquidity.usd).toLocaleString()}`
                      : "--"}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-cyan-500/30 bg-zinc-900 text-center">
              <div>
                <BarChart3 size={54} className="mx-auto text-cyan-400" />

                <h3 className="mt-4 text-xl font-semibold text-white">
                  Aucun token trouvé
                </h3>

                <p className="mt-2 text-zinc-400">
                  Essaie BONK, JUP, WIF, ZTC ou une adresse Solana.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}