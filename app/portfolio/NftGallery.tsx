"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AlertCircle, Image as ImageIcon, LoaderCircle, RefreshCw } from "lucide-react";

type Nft = { id: string; name: string | null; collection: string | null; image: string | null };
type GalleryState = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; nfts: Nft[] };

async function fetchNfts(owner: string, signal: AbortSignal): Promise<Nft[]> {
  const response = await fetch(`/api/nfts?owner=${encodeURIComponent(owner)}`, { cache: "no-store", signal });
  const payload = await response.json() as { nfts?: Nft[]; error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not load NFTs.");
  return payload.nfts ?? [];
}

export default function NftGallery({ owner, french }: { owner: string; french: boolean }) {
  const [state, setState] = useState<{ owner: string; result: Exclude<GalleryState, { status: "loading" }> } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchNfts(owner, controller.signal).then((nfts) => {
      if (!controller.signal.aborted) setState({ owner, result: { status: "ready", nfts } });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setState({
        owner,
        result: {
          status: "error",
          message: error instanceof Error ? error.message : (french ? "Chargement des NFT impossible." : "Could not load NFTs."),
        },
      });
    });
    return () => controller.abort();
  }, [owner, french, retry]);

  const stateForOwner = state?.owner === owner ? state.result : { status: "loading" as const };
  const refreshGallery = () => {
    setState(null);
    setRetry((value) => value + 1);
  };

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="text-purple-400" size={21} />
          <h2 className="text-xl font-bold text-white">NFT</h2>
        </div>
        <button type="button" onClick={refreshGallery} disabled={stateForOwner.status === "loading"} aria-label={french ? "Actualiser les NFT" : "Refresh NFTs"} className="rounded-xl bg-zinc-900 p-2 transition hover:bg-zinc-800 disabled:opacity-50">
          <RefreshCw size={18} className={`text-purple-400 ${stateForOwner.status === "loading" ? "animate-spin" : ""}`} />
        </button>
      </div>

      {stateForOwner.status === "loading" && <div role="status" className="flex items-center gap-3 py-8 text-zinc-300"><LoaderCircle className="animate-spin text-purple-400" />{french ? "Chargement des NFT…" : "Loading NFTs…"}</div>}
      {stateForOwner.status === "error" && <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-900/70 bg-red-950/30 p-4 text-red-200"><AlertCircle className="mt-0.5 shrink-0" /><div className="min-w-0"><p className="font-semibold">{french ? "Galerie NFT indisponible" : "NFT gallery unavailable"}</p><p className="mt-1 break-words text-sm">{stateForOwner.message}</p><button type="button" onClick={refreshGallery} className="mt-3 text-sm font-medium text-red-300 underline underline-offset-2">{french ? "Réessayer" : "Try again"}</button></div></div>}
      {stateForOwner.status === "ready" && stateForOwner.nfts.length === 0 && <p className="py-8 text-center text-zinc-400">{french ? "Aucun NFT détecté dans ce portefeuille." : "No NFTs found in this wallet."}</p>}
      {stateForOwner.status === "ready" && stateForOwner.nfts.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {stateForOwner.nfts.map((nft) => <article key={nft.id} className="min-w-0 overflow-hidden rounded-xl bg-zinc-900">
          {nft.image ? <Image src={nft.image} alt={nft.name ?? (french ? "NFT sans nom" : "Unnamed NFT")} width={480} height={480} unoptimized className="aspect-square w-full bg-zinc-800 object-cover" /> : <div className="flex aspect-square items-center justify-center bg-zinc-800 text-zinc-500"><ImageIcon size={32} /></div>}
          <div className="p-3"><p className="break-words font-semibold text-white">{nft.name ?? (french ? "NFT sans nom" : "Unnamed NFT")}</p>{nft.collection && <p className="mt-1 break-words text-sm text-zinc-400">{nft.collection}</p>}</div>
        </article>)}
      </div>}
    </section>
  );
}
