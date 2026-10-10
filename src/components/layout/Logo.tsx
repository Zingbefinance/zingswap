export default function Logo() {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/images/zingswap-logo.png"
        alt="ZingSwap"
        width={1310}
        height={1200}
        className="h-12 w-12 object-contain"
      />

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
