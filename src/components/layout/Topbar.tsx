import { Search, Wallet } from "lucide-react";

export default function Topbar() {
  return (
    <header className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:px-6 md:py-4">
      {/* Ligne du haut */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">
          Dashboard
        </h1>

        <button className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-black transition hover:bg-cyan-400">
          <Wallet size={18} />

          <span className="hidden sm:inline">
            Connect Wallet
          </span>
        </button>
      </div>

      {/* Barre de recherche */}
      <div className="mt-4">
        <div className="flex w-full items-center gap-2 rounded-xl bg-zinc-900 px-4 py-3">
          <Search
            size={18}
            className="shrink-0 text-zinc-400"
          />

          <input
            placeholder="Search token..."
            className="w-full bg-transparent text-white outline-none placeholder:text-zinc-500"
          />
        </div>
      </div>
    </header>
  );
}