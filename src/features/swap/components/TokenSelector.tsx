"use client";

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
    <div className="space-y-1 rounded-xl bg-zinc-900 p-2">
      {tokens.map((token) => (
        <button
          key={token.mint}
          type="button"
          onClick={() => onSelect?.(token)}
          className="
            flex
            w-full
            items-center
            min-w-0
            gap-3
            rounded-lg
            p-3
            text-left
            transition
            hover:bg-zinc-800
          "
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-500 text-xs font-bold text-black">
            {token.symbol.slice(0, 1)}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-white">
              {token.symbol}
            </p>

            <p className="truncate text-sm text-zinc-500">
              {token.name}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
