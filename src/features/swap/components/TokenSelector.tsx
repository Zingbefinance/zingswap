import { Token } from "@/lib/tokens/types";

interface Props {
  tokens: Token[];
  onSelect?: (token: Token) => void;
}

export default function TokenSelector({
  tokens,
  onSelect,
}: Props) {
  return (
    <div className="space-y-2 rounded-xl bg-zinc-900 p-4">

      {/* SEARCH */}

      <input
        type="text"
        placeholder="Search token..."
        className="
          w-full
          rounded-lg
          bg-zinc-800
          px-4
          py-3
          text-white
          outline-none
          placeholder:text-zinc-500
        "
      />

      {/* TOKEN LIST */}

      <div className="mt-3 space-y-1">

        {tokens.map((token) => (
          <button
            key={token.symbol}
            type="button"
            onClick={() => onSelect?.(token)}
            className="
              flex
              w-full
              items-center
              justify-between
              rounded-lg
              p-3
              transition
              hover:bg-zinc-800
            "
          >

            <div className="flex items-center gap-3">

              <div className="h-8 w-8 rounded-full bg-cyan-500" />

              <div className="text-left">

                <p className="font-semibold text-white">
                  {token.symbol}
                </p>

                <p className="text-sm text-zinc-500">
                  {token.name}
                </p>

              </div>

            </div>

          </button>
        ))}

      </div>

    </div>
  );
}