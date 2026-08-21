export default function SwapPreview() {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
      <h2 className="text-xl font-bold text-white">
        Swap Engine
      </h2>

      <div className="mt-8 space-y-4">

        <div className="rounded-xl bg-zinc-900 p-4">
          <p className="text-zinc-400 text-sm">
            From
          </p>

          <h3 className="text-2xl text-white mt-2">
            SOL
          </h3>
        </div>

        <div className="rounded-xl bg-zinc-900 p-4">
          <p className="text-zinc-400 text-sm">
            To
          </p>

          <h3 className="text-2xl text-white mt-2">
            ZTC
          </h3>
        </div>

        <button
          className="
          w-full
          rounded-xl
          bg-cyan-500
          py-4
          font-bold
          text-black
          hover:bg-cyan-400
          transition
          "
        >
          Launch Swap
        </button>

      </div>
    </div>
  );
}