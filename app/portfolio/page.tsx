"use client";

import MainLayout from "@/components/layout/MainLayout";
import { useLanguage } from "@/components/providers/LanguageContext";
import useWalletInfo from "../hooks/useWalletInfo";
import { AlertCircle, Coins, LoaderCircle, RefreshCw, Wallet } from "lucide-react";

const amountFormat = (amount: number, decimals: number) => new Intl.NumberFormat(undefined, {
  maximumFractionDigits: Math.min(decimals, 9),
}).format(amount);
const usdFormat = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 6 });

export default function PortfolioPage() {
  const { connected, address, state, refresh } = useWalletInfo();
  const { language } = useLanguage();
  const fr = language === "Français";

  return (
    <MainLayout>
      <div className="space-y-6">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
          <div className="flex items-center gap-3">
            <Wallet className="text-cyan-400" size={28} />
            <div>
              <h1 className="text-3xl font-bold text-white">{fr ? "Portefeuille" : "Portfolio"}</h1>
              <p className="mt-2 text-zinc-400">{fr ? "Soldes en lecture seule du wallet Solana connecté." : "Read-only balances for the connected Solana wallet."}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <p className="text-sm text-zinc-400">{fr ? "Adresse du wallet" : "Wallet address"}</p>
          {connected ? <p className="mt-2 break-all font-mono text-sm text-white">{address}</p> : <p className="mt-2 text-zinc-300">{fr ? "Connectez un wallet pour consulter vos actifs." : "Connect a wallet to view your assets."}</p>}
        </section>

        {connected && <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold text-white">{fr ? "Actifs" : "Assets"}</h2>
              {state.status === "ready" && <p className="mt-1 text-xs text-zinc-500">{fr ? "Mis à jour" : "Updated"} {new Date(state.updatedAt).toLocaleTimeString()}</p>}
            </div>
            <button type="button" onClick={() => void refresh()} disabled={state.status === "loading"} aria-label={fr ? "Actualiser les soldes" : "Refresh balances"} className="rounded-xl bg-zinc-900 p-2 transition hover:bg-zinc-800 disabled:cursor-wait disabled:opacity-50">
              <RefreshCw size={18} className={`text-cyan-400 ${state.status === "loading" ? "animate-spin" : ""}`} />
            </button>
          </div>

          {(state.status === "loading" || state.status === "idle") && <div className="flex items-center gap-3 py-8 text-zinc-300"><LoaderCircle className="animate-spin text-cyan-400" />{fr ? "Lecture des soldes sur le réseau…" : "Loading balances from the network…"}</div>}
          {state.status === "error" && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-900/70 bg-red-950/30 p-4 text-red-200"><AlertCircle className="mt-0.5 shrink-0" /><div><p className="font-semibold">{fr ? "Lecture des soldes impossible" : "Could not load balances"}</p><p className="mt-1 text-sm">{state.error}</p><p className="mt-2 text-sm text-red-300">{fr ? "Aucun solde nul n’est affiché comme résultat de cette erreur." : "No zero balance is shown as a result of this error."}</p></div></div>}
          {state.status === "ready" && <>
            {state.pricesUnavailable && <p className="mb-3 text-sm text-amber-300">{fr ? "Les prix USD sont temporairement indisponibles ; les quantités restent affichées." : "USD prices are temporarily unavailable; quantities are still shown."}</p>}
            {state.assets.length === 0 ? <p className="py-8 text-center text-zinc-400">{fr ? "Aucun actif détecté." : "No assets found."}</p> : <div className="space-y-3">
              {state.assets.map((asset) => {
                const price = state.prices[asset.mint];
                return <article key={asset.mint} className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-zinc-900 p-4">
                  <div className="flex min-w-0 items-center gap-3"><Coins className="shrink-0 text-cyan-400" /><div className="min-w-0"><p className="font-semibold text-white">{asset.symbol}<span className="ml-2 font-normal text-zinc-400">{asset.name}</span></p><p className="truncate font-mono text-xs text-zinc-500">{asset.mint}</p></div></div>
                  <div className="text-right"><p className="font-medium tabular-nums text-white">{amountFormat(asset.amount, asset.decimals)} <span className="text-zinc-400">{asset.symbol}</span></p>{price && <p className="mt-1 text-sm tabular-nums text-zinc-400">{usdFormat.format(asset.amount * price.usd)}</p>}</div>
                </article>;
              })}
            </div>}
          </>}
        </section>}
      </div>
    </MainLayout>
  );
}
