"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import SwapCard from "./SwapCard";
import EvmSwapCard from "./EvmSwapCard";
import TonSwapCard from "./TonSwapCard";
import { getSwapNetwork, isTonNetwork, isSolanaNetwork, LIFI_SOLANA_CHAIN_ID, SWAP_NETWORKS, type SwapNetworkId } from "@/lib/lifi/chains";
import { BSC_USDT_ADDRESS, SOLANA_USDT_ADDRESS } from "@/lib/lifi/pinnedUsdt";

type NetworkSide = "from" | "to";

function networkFromParam(value: string | null): SwapNetworkId | null {
  const id = Number(value);
  return SWAP_NETWORKS.some((network) => network.id === id) ? id as SwapNetworkId : null;
}

export default function SwapNetworkSwitcher() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const routeFromChain = networkFromParam(searchParams.get("fromChain"));
  const routeToChain = networkFromParam(searchParams.get("toChain"));
  const [networkOverride, setNetworkOverride] = useState<{
    searchKey: string;
    from: SwapNetworkId;
    to: SwapNetworkId;
  } | null>(null);
  const overrideIsCurrent = networkOverride?.searchKey === searchKey;
  const fromChain = overrideIsCurrent ? networkOverride.from : routeFromChain ?? LIFI_SOLANA_CHAIN_ID;
  const toChain = overrideIsCurrent ? networkOverride.to : routeToChain ?? LIFI_SOLANA_CHAIN_ID;
  const [dialogSide, setDialogSide] = useState<NetworkSide | null>(null);
  const inputMint = searchParams.get("inputMint") ?? undefined;
  const outputMint = searchParams.get("outputMint") ?? undefined;
  const initialFromToken = routeFromChain === fromChain ? searchParams.get("fromToken") ?? "" : "";
  const initialToToken = routeToChain === toChain ? searchParams.get("toToken") ?? "" : "";

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
    setNetworkOverride({
      searchKey,
      from: dialogSide === "from" ? networkId : fromChain,
      to: dialogSide === "to" ? networkId : toChain,
    });
    setDialogSide(null);
  };
  const selectSolanaToBscUsdt = () => {
    const params = new URLSearchParams(searchKey);
    params.set("fromChain", String(LIFI_SOLANA_CHAIN_ID));
    params.set("toChain", "56");
    params.set("fromToken", SOLANA_USDT_ADDRESS);
    params.set("toToken", BSC_USDT_ADDRESS);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <section className="space-y-3">
      <button type="button" onClick={selectSolanaToBscUsdt} className="w-full rounded-xl border border-cyan-800 bg-cyan-950/40 px-4 py-3 text-left text-sm text-cyan-100 transition hover:border-cyan-500 hover:bg-cyan-950/70">
        <span className="block font-semibold">USDT Solana → USDT BEP-20</span>
        <span className="mt-1 block text-xs text-cyan-200/70">Préparer le swap vers Binance-Peg USDT sur BNB Chain</span>
      </button>
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
                  <span className="mt-1 block text-xs text-zinc-500">{network.kind === "ton" ? "TON Connect · Omniston" : `Chain ID LI.FI : ${network.id}`}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {(isTonNetwork(fromChain) || isTonNetwork(toChain)) && (isSolanaNetwork(fromChain) || isSolanaNetwork(toChain))
        ? <div className="rounded-2xl border border-amber-800 bg-amber-950/40 p-4 text-sm text-amber-200">Omniston n’inclut pas Solana dans sa matrice de réseaux actuelle. Cette paire n’est pas proposée comme swap TON↔Solana.</div>
        : isTonNetwork(fromChain) || isTonNetwork(toChain)
        ? <TonSwapCard fromChain={fromChain} toChain={toChain} />
        : fromChain === LIFI_SOLANA_CHAIN_ID && toChain === LIFI_SOLANA_CHAIN_ID
        ? <SwapCard inputMint={inputMint} outputMint={outputMint} />
        : <EvmSwapCard fromChain={fromChain} toChain={toChain} initialFromToken={initialFromToken} initialToToken={initialToToken} />}
    </section>
  );
}
