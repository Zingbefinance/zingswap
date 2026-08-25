"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

export type Language = "Français" | "English";

type LanguageContextType = {
  language: Language;
  setLanguage: (language: Language) => void;
};

const LanguageContext =
  createContext<LanguageContextType | null>(null);

export function LanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [language, setLanguageState] =
    useState<Language>("Français");

  useEffect(() => {
    const savedLanguage =
      window.localStorage.getItem("zingswap-language");

    if (
      savedLanguage === "Français" ||
      savedLanguage === "English"
    ) {
      setLanguageState(savedLanguage);
    }
  }, []);

  const setLanguage = (value: Language) => {
    setLanguageState(value);
    window.localStorage.setItem(
      "zingswap-language",
      value
    );
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error(
      "useLanguage must be used inside LanguageProvider"
    );
  }

  return context;
}