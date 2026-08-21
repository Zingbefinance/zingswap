export default function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500 text-xl font-bold text-black">
        Z
      </div>

      <div>
        <h2 className="text-xl font-bold text-white">
          ZingSwap
        </h2>

        <p className="text-sm text-gray-400">
          Cross-Chain DEX
        </p>
      </div>
    </div>
  );
}