"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Search } from "lucide-react";

import {
  getLocalTokenList,
  searchTokens,
} from "@/lib/tokens/tokenRegistry";
import { Token } from "@/lib/tokens/types";
import { useSelectedToken } from "@/components/providers/TokenContext";

function TokensContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    setSelectedToken,
    setSelectedSide,
  } = useSelectedToken();

  const side = searchParams.get("side");

  const [tokens, setTokens] = useState<Token[]>(
    getLocalTokenList()
  );

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prices, setPrices] = useState<
    Record<string, { usd: number; change24h: number | null }>
  >({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesUnavailable, setPricesUnavailable] = useState(false);

  useEffect(() => {
    if (tokens.length === 0) {
      setPrices({});
      setPricesLoading(false);
      setPricesUnavailable(false);
      return;
    }

    let cancelled = false;
    const mints = Array.from(new Set(tokens.map((token) => token.mint)));

    setPrices({});
    setPricesLoading(true);
    setPricesUnavailable(false);

    fetch(`/api/tokens/prices?mints=${encodeURIComponent(mints.join(","))}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("Prices unavailable");
        return (await response.json()) as {
          prices?: Record<string, { usd: number; change24h: number | null }>;
        };
      })
      .then((data) => {
        if (!cancelled) setPrices(data.prices ?? {});
      })
      .catch(() => {
        if (!cancelled) setPricesUnavailable(true);
      })
      .finally(() => {
        if (!cancelled) setPricesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tokens]);

  const formatUsd = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumSignificantDigits: 2,
      maximumSignificantDigits: 6,
    }).format(value);

  useEffect(() => {
    const query = search.trim();

    if (!query) {
      setTokens(getLocalTokenList());
      setLoading(false);
      setError("");
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        setError("");

        const result = await searchTokens(query);

        if (!cancelled) {
          setTokens(result);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(
            "Erreur recherche token :",
            err
          );

          setError(
            "Impossible de rechercher les tokens."
          );

          setTokens([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const handleSelectToken = (token: Token) => {
    setSelectedToken({
      symbol: token.symbol,
      name: token.name,
      mint: token.mint,
      decimals: token.decimals,
    });

    if (side === "from" || side === "to") {
      setSelectedSide(side);
    } else {
      setSelectedSide(null);
    }

    router.push("/");
  };

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-2xl">

        <div className="mb-6 flex items-center gap-3">
          <Link
            href="/"
            className="
              rounded-lg
              bg-zinc-900
              p-2
              text-zinc-300
              transition
              hover:bg-zinc-800
              hover:text-white
            "
          >
            <ArrowLeft size={20} />
          </Link>

          <div>
            <h1 className="text-xl font-bold">
              Rechercher un token
            </h1>

            <p className="text-sm text-zinc-500">
              {side === "from"
                ? "Choisissez le token à échanger."
                : side === "to"
                  ? "Choisissez le token à recevoir."
                  : "Recherchez par nom, symbole ou adresse mint."}
            </p>
          </div>
        </div>

        <div className="relative">
          <Search
            size={20}
            className="
              absolute
              left-4
              top-1/2
              -translate-y-1/2
              text-zinc-500
            "
          />

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Rechercher un token..."
            autoFocus
            className="
              w-full
              rounded-xl
              border
              border-zinc-800
              bg-zinc-900
              py-4
              pl-12
              pr-4
              text-white
              outline-none
              placeholder:text-zinc-500
              focus:border-cyan-500
            "
          />
        </div>

        <div className="mt-4">

          {loading && (
            <div
              className="
                rounded-xl
                bg-zinc-900
                p-6
                text-center
                text-sm
                text-zinc-500
              "
            >
              Recherche des tokens...
            </div>
          )}

          {!loading && error && (
            <div
              className="
                rounded-xl
                bg-zinc-900
                p-6
                text-center
                text-sm
                text-red-400
              "
            >
              {error}
            </div>
          )}

          {!loading &&
            !error &&
            tokens.length === 0 && (
              <div
                className="
                  rounded-xl
                  bg-zinc-900
                  p-6
                  text-center
                  text-sm
                  text-zinc-500
                "
              >
                Aucun token trouvé.
              </div>
            )}

          {!loading &&
            !error &&
            tokens.length > 0 && (
              <div className="space-y-1">

                {tokens.map((token) => (
                  <button
                    key={token.mint}
                    type="button"
                    onClick={() =>
                      handleSelectToken(token)
                    }
                    className="
                      flex
                      w-full
                      items-center
                      justify-between
                      rounded-xl
                      bg-zinc-900
                      p-4
                      text-left
                      transition
                      hover:bg-zinc-800
                    "
                  >

                    <div className="flex items-center gap-3">

                      <div
                        className="
                          flex
                          h-10
                          w-10
                          shrink-0
                          items-center
                          justify-center
                          overflow-hidden
                          rounded-full
                          bg-cyan-500
                          font-bold
                          text-black
                        "
                      >
                        {token.symbol.slice(0, 1)}
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-white">
                          {token.symbol}
                        </p>

                        <p className="truncate text-sm text-zinc-500">
                          {token.name}
                        </p>

                        <p className="truncate text-xs text-zinc-700">
                          {token.mint}
                        </p>
                      </div>

                    </div>

                    <div className="ml-3 shrink-0 text-right">
                      <p className="text-sm font-medium text-zinc-200">
                        {pricesLoading
                          ? "Chargement du prix..."
                          : prices[token.mint]
                            ? formatUsd(prices[token.mint].usd)
                            : "Prix indisponible"}
                      </p>
                      {prices[token.mint]?.change24h != null && (
                        <p
                          className={`text-xs ${
                            prices[token.mint].change24h! >= 0
                              ? "text-emerald-400"
                              : "text-red-400"
                          }`}
                        >
                          {prices[token.mint].change24h! > 0 ? "+" : ""}
                          {prices[token.mint].change24h!.toFixed(2)}% · 24 h
                        </p>
                      )}
                      {!pricesLoading && pricesUnavailable && (
                        <p className="text-xs text-zinc-500">
                          Données de prix indisponibles
                        </p>
                      )}
                    </div>

                  </button>
                ))}

              </div>
            )}

        </div>
      </div>
    </main>
  );
}

function TokensLoading() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-2xl">
        <div className="rounded-xl bg-zinc-900 p-6 text-center text-sm text-zinc-500">
          Chargement...
        </div>
      </div>
    </main>
  );
}

export default function TokensPage() {
  return (
    <Suspense fallback={<TokensLoading />}>
      <TokensContent />
    </Suspense>
  );
}
