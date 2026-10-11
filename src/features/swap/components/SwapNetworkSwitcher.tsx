"use client";

import { useEffect, useState } from "react";
import SwapCard from "./SwapCard";
import EvmSwapCard from "./EvmSwapCard";
import { getSwapNetwork, LIFI_SOLANA_CHAIN_ID, SWAP_NETWORKS, type SwapNetworkId } from "@/lib/lifi/chains";

type NetworkSide = "from" | "to";

export default function SwapNetworkSwitcher() {
  const [fromChain, setFromChain] = useState<SwapNetworkId>(LIFI_SOLANA_CHAIN_ID);
  const [toChain, setToChain] = useState<SwapNetworkId>(LIFI_SOLANA_CHAIN_ID);
  const [initialFromToken, setInitialFromToken] = useState("");
  const [initialToToken, setInitialToToken] = useState("");
  const [dialogSide, setDialogSide] = useState<NetworkSide | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const validNetwork = (value: string | null): SwapNetworkId | null => {
      const id = Number(value);
      return SWAP_NETWORKS.some((network) => network.id === id) ? id as SwapNetworkId : null;
    };
    const nextFrom = validNetwork(params.get("fromChain"));
    const nextTo = validNetwork(params.get("toChain"));
    if (nextFrom) setFromChain(nextFrom);
    if (nextTo) setToChain(nextTo);
    setInitialFromToken(params.get("fromToken") ?? "");
    setInitialToToken(params.get("toToken") ?? "");
  }, []);

  useEffect(() => {
    if (!dialogSide) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDialogSide(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogSide]);

  const fromNetwork = getSwapNetwork(fromChain)!;
  const toNetwork = getSwapNetwork(toChain)!;
  const selectNetwork = (networkId: SwapNetworkId) => {
    if (dialogSide === "from") setFromChain(networkId);
    if (dialogSide === "to") setToChain(networkId);
    setDialogSide(null);
  };

  return (
    <section className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          ["from", "Réseau de départ", fromNetwork.name],
          ["to", "Réseau d’arrivée", toNetwork.name],
        ] as const).map(([side, label, value]) => (
          <button
            key={side}
            type="button"
            onClick={() => setDialogSide(side)}
            aria-haspopup="dialog"
            className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3 text-left text-sm text-white transition hover:border-cyan-500 sm:px-4"
          >
            <span className="min-w-0"><span className="block text-xs text-zinc-500">{label}</span><span className="mt-1 block truncate font-semibold">{value}</span></span>
            <span className="text-zinc-500" aria-hidden="true">⌄</span>
          </button>
        ))}
      </div>

      {dialogSide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 sm:p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setDialogSide(null); }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="network-dialog-title" className="max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-4 shadow-2xl sm:p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 id="network-dialog-title" className="min-w-0 text-base font-semibold text-white sm:text-lg">Choisir le réseau {dialogSide === "from" ? "de départ" : "d’arrivée"}</h2>
              <button type="button" aria-label="Fermer" onClick={() => setDialogSide(null)} className="rounded-lg px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-white">✕</button>
            </div>
            <div className="space-y-2">
              {SWAP_NETWORKS.map((network) => (
                <button key={network.id} type="button" onClick={() => selectNetwork(network.id)} className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-left text-white hover:border-cyan-500">
                  <span className="font-medium">{network.name}</span>
                  <span className="mt-1 block text-xs text-zinc-500">Chain ID LI.FI : {network.id}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {fromChain === LIFI_SOLANA_CHAIN_ID && toChain === LIFI_SOLANA_CHAIN_ID
        ? <SwapCard />
        : <EvmSwapCard fromChain={fromChain} toChain={toChain} initialFromToken={initialFromToken} initialToToken={initialToToken} />}
    </section>
  );
}
