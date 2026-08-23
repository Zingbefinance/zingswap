import MainLayout from "@/components/layout/MainLayout";
import StatsGrid from "@/components/dashboard/StatsGrid";
import SwapCard from "@/features/swap/components/SwapCard";
import { Flame, Newspaper, Image as ImageIcon, Rocket } from "lucide-react";
export default function Home() {
  return (
    <MainLayout>
      <div className="flex flex-col gap-6">
        {/* Swap en premier sur mobile */}
        <div className="order-1 md:order-2">
          <SwapCard />
        </div>

        {/* Dashboard en dessous sur mobile, en premier sur PC */}
        <div className="order-2 md:order-1">
          <StatsGrid />
        </div>
      </div>
    </MainLayout>
  );
  {/* Zing Hub */}
<div className="order-3">
  <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">

    <div className="mb-5 flex items-center justify-between">
      <div>
        <h2 className="text-xl font-bold text-white">
          Zing Hub
        </h2>

        <p className="text-sm text-zinc-400">
          Nouveautés, tendances et annonces.
        </p>
      </div>

      <span className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-400">
        LIVE
      </span>
    </div>

    <div className="space-y-3">

      <div className="flex items-center gap-4 rounded-xl bg-zinc-900 p-4">
        <Rocket className="text-cyan-400" size={22} />

        <div>
          <p className="font-semibold text-white">
            Nouveau Token
          </p>

          <p className="text-sm text-zinc-400">
            ZTC est désormais compatible avec la page Graphique.
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-zinc-900 p-4">
  <div className="mb-3 flex items-center gap-3">
    <Flame className="text-orange-400" size={22} />

    <p className="font-semibold text-white">
      Trending Solana
    </p>
  </div>

  <div className="flex flex-wrap gap-2">
    {["BONK", "JUP", "WIF", "PYTH", "JTO"].map((token) => (
      <button
        key={token}
        onClick={() =>
          window.open(
            `https://dexscreener.com/search?q=${token}`,
            "_blank"
          )
        }
        className="rounded-full border border-zinc-700 px-3 py-1 text-sm text-zinc-300 transition hover:border-cyan-400 hover:text-cyan-400"
      >
        {token}
      </button>
    ))}
  </div>
</div>

      <div className="flex items-center gap-4 rounded-xl bg-zinc-900 p-4">
        <ImageIcon className="text-purple-400" size={22} />

        <div>
          <p className="font-semibold text-white">
            NFT Spotlight
          </p>

          <p className="text-sm text-zinc-400">
            Les collections NFT seront affichées ici.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4 rounded-xl bg-zinc-900 p-4">
        <Newspaper className="text-green-400" size={22} />

        <div>
          <p className="font-semibold text-white">
            Zing News
          </p>

          <p className="text-sm text-zinc-400">
            Les annonces officielles de ZingSwap apparaîtront ici.
          </p>
        </div>
      </div>

    </div>
  </div>
</div>
}