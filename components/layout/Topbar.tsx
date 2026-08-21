import { Bell, Search } from "lucide-react";

export default function Topbar() {
  return (
    <header className="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-950 px-6 py-4">
      <h1 className="text-2xl font-bold text-white">
        Dashboard
      </h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2">
          <Search size={18} className="text-zinc-400" />
          <input
            placeholder="Search token..."
            className="bg-transparent text-white outline-none placeholder:text-zinc-500"
          />
        </div>

        <button className="rounded-xl bg-zinc-900 p-3 hover:bg-cyan-500 hover:text-black transition">
          <Bell size={18} />
        </button>

        <button className="rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-black">
          Connect Wallet
        </button>
      </div>
    </header>
  );
}