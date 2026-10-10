"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export const DEFAULT_SLIPPAGE_BPS = 50;
const STORAGE_KEY = "zingswap-slippage-bps";
const ALLOWED_SLIPPAGE_BPS = [10, 50, 100, 300] as const;

type SettingsContextValue = {
  slippageBps: number;
  setSlippageBps: (value: number) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [slippageBps, setSlippageState] = useState(DEFAULT_SLIPPAGE_BPS);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(STORAGE_KEY));
    if (ALLOWED_SLIPPAGE_BPS.includes(saved as (typeof ALLOWED_SLIPPAGE_BPS)[number])) {
      setSlippageState(saved);
    }
  }, []);

  const setSlippageBps = useCallback((value: number) => {
    if (!ALLOWED_SLIPPAGE_BPS.includes(value as (typeof ALLOWED_SLIPPAGE_BPS)[number])) return;
    setSlippageState(value);
    window.localStorage.setItem(STORAGE_KEY, String(value));
  }, []);

  return (
    <SettingsContext.Provider value={{ slippageBps, setSlippageBps }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside SettingsProvider");
  return context;
}
