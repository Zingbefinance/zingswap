"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";
import { TOKENS } from "@/lib/tokens/tokens";

export type TokenSide = "from" | "to";

export type SelectedToken = {
  symbol: string;
  mint: string;
  name: string;
  decimals: number;
};

const DEFAULT_TOKEN: SelectedToken = {
  symbol: "ZTC",
  name: "Zing Token",
  mint: "4zihBzwHLx9z7aNmXam181iUd285xbqJNN57M5LhoHpu",
  decimals: 6,
};

type TokenContextType = {
  selectedToken: SelectedToken;
  setSelectedToken: (token: SelectedToken) => void;
  selectedSide: TokenSide | null;
  setSelectedSide: (side: TokenSide | null) => void;
  fromToken: (typeof TOKENS)[number];
  toToken: (typeof TOKENS)[number];
  selectSwapToken: (side: TokenSide, token: (typeof TOKENS)[number]) => void;
  setSwapTokens: (fromToken: (typeof TOKENS)[number], toToken: (typeof TOKENS)[number]) => void;
};

const TokenContext = createContext<TokenContextType | null>(null);

export function TokenProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedToken, setSelectedToken] =
    useState<SelectedToken>(DEFAULT_TOKEN);

  const [selectedSide, setSelectedSide] =
    useState<TokenSide | null>(null);
  const [swapTokens, setSwapTokens] = useState<[typeof TOKENS[number], typeof TOKENS[number]]>([TOKENS[0], TOKENS[1]]);
  const selectSwapToken = (side: TokenSide, token: typeof TOKENS[number]) => {
    setSwapTokens(([fromToken, toToken]) => side === "from"
      ? [token, token.mint === toToken.mint ? fromToken : toToken]
      : [token.mint === fromToken.mint ? toToken : fromToken, token]);
  };

  return (
    <TokenContext.Provider
      value={{
        selectedToken,
        setSelectedToken,
        selectedSide,
        setSelectedSide,
        fromToken: swapTokens[0],
        toToken: swapTokens[1],
        selectSwapToken,
        setSwapTokens: (fromToken, toToken) => setSwapTokens([fromToken, toToken]),
      }}
    >
      {children}
    </TokenContext.Provider>
  );
}

export function useSelectedToken() {
  const context = useContext(TokenContext);

  if (!context) {
    throw new Error(
      "useSelectedToken must be used inside TokenProvider"
    );
  }

  return context;
}
