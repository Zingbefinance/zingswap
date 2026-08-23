"use client";

import {
  createContext,
  useContext,
  useState,
  ReactNode,
} from "react";

export type SelectedToken = {
  symbol: string;
  mint: string;
  name: string;
};

const DEFAULT_TOKEN: SelectedToken = {
  symbol: "ZTC",
  name: "Zing Token",
  mint: "ZTC",
};

type TokenContextType = {
  selectedToken: SelectedToken;
  setSelectedToken: (token: SelectedToken) => void;
};

const TokenContext = createContext<TokenContextType | null>(null);

export function TokenProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [selectedToken, setSelectedToken] =
    useState(DEFAULT_TOKEN);

  return (
    <TokenContext.Provider
      value={{
        selectedToken,
        setSelectedToken,
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