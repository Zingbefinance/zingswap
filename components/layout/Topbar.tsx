import { Bell, Search } from "lucide-react";

export default function Topbar() {
  return (
    <header className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:px-6 md:py-4">

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">

        <h1 className="text-2xl font-bold text-white">
          Dashboard
        </h1>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">

          <div className="flex w-full sm:w-64 items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2">
            <Search size={18} className="text-zinc-400 shrink-0" />

            <input
              placeholder="Search token..."
              className="w-full bg-transparent text-white outline-none placeholder:text-zinc-500"
            />
          </div>

          <button className="self-start sm:self-auto rounded-xl bg-zinc-900 p-3 transition hover:bg-cyan-500 hover:text-black">
            <Bell size={18} />
          </button>

          <button className="w-full sm:w-auto rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-black transition hover:bg-cyan-400">
            Connect Wallet
          </button>

        </div>

      </div>

    </header>
  );
}