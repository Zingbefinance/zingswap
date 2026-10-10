"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";

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

  return (
    <TokenContext.Provider
      value={{
        selectedToken,
        setSelectedToken,
        selectedSide,
        setSelectedSide,
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