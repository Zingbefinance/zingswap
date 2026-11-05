import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const DEX_SEARCH_URL = "https://api.dexscreener.com/latest/dex/search";
const DEX_PAIR_URL = "https://api.dexscreener.com/latest/dex/pairs/solana";
const DEX_TOKEN_PAIRS_URL = "https://api.dexscreener.com/token-pairs/v1/solana";
const GECKO_BASE_URL = "https://api.geckoterminal.com/api/v2";
const GECKO_POOL_CACHE_SECONDS = 60;
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const PAIR_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{20,64}$/;
const HTTP_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HTTP_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function validRetryAfter(value: string | null): string | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return value;

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const date = new Date(parsed);
  const weekday = HTTP_WEEKDAYS[date.getUTCDay()];
  const month = HTTP_MONTHS[date.getUTCMonth()];
  const day = String(date.getUTCDate()).padStart(2, "0");
  const time = `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")}`;

  if (/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value)) {
    return date.toUTCString() === value ? value : null;
  }

  const rfc850 = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}:\d{2}:\d{2}) GMT$/.exec(value);
  if (rfc850) {
    const longWeekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    return rfc850[1] === longWeekdays[date.getUTCDay()] && rfc850[2] === day && rfc850[3] === month &&
      rfc850[4] === String(date.getUTCFullYear()).slice(-2) && rfc850[5] === time ? value : null;
  }

  const asctime = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([ 0-9]\d) (\d{2}:\d{2}:\d{2}) (\d{4})$/.exec(value);
  if (asctime) {
    const asctimeDay = String(date.getUTCDate()).padStart(2, " ");
    return asctime[1] === weekday && asctime[2] === month && asctime[3] === asctimeDay && asctime[4] === time &&
      asctime[5] === String(date.getUTCFullYear()) ? value : null;
  }

  return null;
}

type MarketPair = {
  chainId: string;
  dexId?: string;
  baseToken: { address?: string; name?: string; symbol: string };
  quoteToken: { address?: string; symbol: string };
  pairAddress: string;
  priceUsd?: string;
  liquidity?: { usd?: number; base?: number; quote?: number };
  priceNative?: string;
  volume?: { h24?: number };
  priceChange?: { h24?: number };
};

type PairQuote = {
  address: string;
  network: "solana";
  dexId: string | null;
  tokenAddress: string;
  baseMint: string;
  quoteMint: string;
  base: string;
  quote: string;
  priceUsd: string;
  priceNative: string | null;
  liquidityUsd: number | null;
  liquidityBase: number | null;
  liquidityQuote: number | null;
  volume24hUsd: number | null;
  priceChange24hPct: number | null;
  source: "DexScreener" | "GeckoTerminal";
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalFiniteNumber(value: unknown, minimum = -Infinity): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : undefined;
}

function makePairQuote(input: {
  address: unknown;
  network: unknown;
  dexId: unknown;
  baseMint: unknown;
  quoteMint: unknown;
  base: unknown;
  quote: unknown;
  priceUsd: unknown;
  priceNative: unknown;
  liquidityUsd: unknown;
  liquidityBase: unknown;
  liquidityQuote: unknown;
  volume24hUsd: unknown;
  priceChange24hPct: unknown;
  source: PairQuote["source"];
}, requestedAddress: string): PairQuote | null {
  const priceUsd = optionalFiniteNumber(input.priceUsd, Number.MIN_VALUE);
  const priceNative = optionalFiniteNumber(input.priceNative, Number.MIN_VALUE);
  const liquidityUsd = optionalFiniteNumber(input.liquidityUsd, 0);
  const liquidityBase = optionalFiniteNumber(input.liquidityBase, 0);
  const liquidityQuote = optionalFiniteNumber(input.liquidityQuote, 0);
  const volume24hUsd = optionalFiniteNumber(input.volume24hUsd, 0);
  const priceChange24hPct = optionalFiniteNumber(input.priceChange24hPct);
  if (input.address !== requestedAddress || input.network !== "solana" ||
      typeof input.baseMint !== "string" || !SOLANA_ADDRESS_PATTERN.test(input.baseMint) ||
      typeof input.quoteMint !== "string" || !SOLANA_ADDRESS_PATTERN.test(input.quoteMint) ||
      input.baseMint === input.quoteMint || typeof input.base !== "string" || !input.base.trim() ||
      typeof input.quote !== "string" || !input.quote.trim() ||
      typeof priceUsd !== "number" || typeof priceNative === "undefined" ||
      typeof liquidityUsd === "undefined" || typeof liquidityBase === "undefined" ||
      typeof liquidityQuote === "undefined" || typeof volume24hUsd === "undefined" ||
      typeof priceChange24hPct === "undefined") return null;

  return {
    address: requestedAddress,
    network: "solana",
    dexId: typeof input.dexId === "string" && input.dexId.trim() ? input.dexId.trim() : null,
    tokenAddress: input.baseMint,
    baseMint: input.baseMint,
    quoteMint: input.quoteMint,
    base: input.base.trim(),
    quote: input.quote.trim(),
    priceUsd: String(priceUsd),
    priceNative: typeof priceNative === "number" ? String(priceNative) : null,
    liquidityUsd: typeof liquidityUsd === "number" ? liquidityUsd : null,
    liquidityBase: typeof liquidityBase === "number" ? liquidityBase : null,
    liquidityQuote: typeof liquidityQuote === "number" ? liquidityQuote : null,
    volume24hUsd: typeof volume24hUsd === "number" ? volume24hUsd : null,
    priceChange24hPct: typeof priceChange24hPct === "number" ? priceChange24hPct : null,
    source: input.source,
    updatedAt: new Date().toISOString(),
  };
}

function parseDexPairQuote(payload: unknown, address: string): PairQuote | null {
  if (!isRecord(payload) || !Array.isArray(payload.pairs)) return null;
  const pair = payload.pairs.find((item) => isRecord(item) && item.pairAddress === address);
  if (!isRecord(pair) || !isRecord(pair.baseToken) || !isRecord(pair.quoteToken)) return null;
  return makePairQuote({
    address: pair.pairAddress,
    network: pair.chainId,
    dexId: pair.dexId,
    baseMint: pair.baseToken.address,
    quoteMint: pair.quoteToken.address,
    base: pair.baseToken.symbol,
    quote: pair.quoteToken.symbol,
    priceUsd: pair.priceUsd,
    priceNative: pair.priceNative,
    liquidityUsd: isRecord(pair.liquidity) ? pair.liquidity.usd : null,
    liquidityBase: isRecord(pair.liquidity) ? pair.liquidity.base : null,
    liquidityQuote: isRecord(pair.liquidity) ? pair.liquidity.quote : null,
    volume24hUsd: isRecord(pair.volume) ? pair.volume.h24 : null,
    priceChange24hPct: isRecord(pair.priceChange) ? pair.priceChange.h24 : null,
    source: "DexScreener",
  }, address);
}

function parseDexTokenPairsQuote(payload: unknown, address: string): PairQuote | null {
  if (!Array.isArray(payload)) return null;
  return parseDexPairQuote({ pairs: payload }, address);
}

function parseGeckoPairQuote(payload: unknown, address: string): PairQuote | null {
  if (!isRecord(payload) || !isRecord(payload.data) || !isRecord(payload.data.attributes) ||
      !isRecord(payload.data.relationships) || !Array.isArray(payload.included)) return null;
  const pool = payload.data;
  const attributes = pool.attributes as Record<string, unknown>;
  if (pool.type !== "pool" || pool.id !== `solana_${address}` || attributes.address !== address) return null;
  const relationships = pool.relationships as Record<string, unknown>;
  const baseId = isRecord(relationships.base_token) && isRecord(relationships.base_token.data)
    ? relationships.base_token.data.id : null;
  const quoteId = isRecord(relationships.quote_token) && isRecord(relationships.quote_token.data)
    ? relationships.quote_token.data.id : null;
  const dexId = isRecord(relationships.dex) && isRecord(relationships.dex.data)
    ? relationships.dex.data.id : null;
  const tokens = new Map<string, { address: string; symbol: string }>();
  for (const item of payload.included) {
    if (!isRecord(item) || item.type !== "token" || typeof item.id !== "string" || !isRecord(item.attributes)) continue;
    const tokenAddress = item.attributes.address;
    const symbol = item.attributes.symbol;
    if (typeof tokenAddress === "string" && SOLANA_ADDRESS_PATTERN.test(tokenAddress) &&
        item.id === `solana_${tokenAddress}` && typeof symbol === "string" && symbol.trim()) {
      tokens.set(item.id, { address: tokenAddress, symbol: symbol.trim() });
    }
  }
  const baseToken = typeof baseId === "string" ? tokens.get(baseId) : undefined;
  const quoteToken = typeof quoteId === "string" ? tokens.get(quoteId) : undefined;
  if (!baseToken || !quoteToken) return null;
  const volume = isRecord(attributes.volume_usd) ? attributes.volume_usd.h24 : null;
  const priceChange = isRecord(attributes.price_change_percentage) ? attributes.price_change_percentage.h24 : null;
  return makePairQuote({
    address: attributes.address,
    network: "solana",
    dexId,
    baseMint: baseToken.address,
    quoteMint: quoteToken.address,
    base: baseToken.symbol,
    quote: quoteToken.symbol,
    priceUsd: attributes.base_token_price_usd,
    priceNative: attributes.base_token_price_quote_token,
    liquidityUsd: attributes.reserve_in_usd,
    liquidityBase: null,
    liquidityQuote: null,
    volume24hUsd: volume,
    priceChange24hPct: priceChange,
    source: "GeckoTerminal",
  }, address);
}

const candleIntervals = {
  "1m": { timeframe: "minute", aggregate: "1", seconds: 60 },
  "5m": { timeframe: "minute", aggregate: "5", seconds: 5 * 60 },
  "15m": { timeframe: "minute", aggregate: "15", seconds: 15 * 60 },
  "1h": { timeframe: "hour", aggregate: "1", seconds: 60 * 60 },
  "4h": { timeframe: "hour", aggregate: "4", seconds: 4 * 60 * 60 },
  "1d": { timeframe: "day", aggregate: "1", seconds: 24 * 60 * 60 },
  // GeckoTerminal exposes minute, hour and day OHLCV. Weekly bars are
  // aggregated from real daily pool candles below, never from price snapshots.
  "1w": { timeframe: "day", aggregate: "1", seconds: 7 * 24 * 60 * 60 },
} as const;

const historyRanges = {
  "24H": 24 * 60 * 60,
  "7D": 7 * 24 * 60 * 60,
  "30D": 30 * 24 * 60 * 60,
  "180D": 180 * 24 * 60 * 60,
} as const;

type OhlcvCandle = { time: number; open: number; high: number; low: number; close: number; volume: number | null };
const MAX_CANDLES_PER_REQUEST = 1000;
const INVALID_NUMBER = Symbol("invalid number");

type GeckoNumber = number | null | typeof INVALID_NUMBER;

function readGeckoNumber(value: unknown): GeckoNumber {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" && typeof value !== "string") return INVALID_NUMBER;
  if (typeof value === "string" && value.trim() === "") return INVALID_NUMBER;
  const number = Number(value);
  return Number.isFinite(number) ? number : INVALID_NUMBER;
}

function parseGeckoPools(payload: unknown, mint: string): MarketPair[] | null {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as { data?: unknown; included?: unknown };
  if (!Array.isArray(response.data)) return null;
  if (response.data.length === 0) return [];
  if (!Array.isArray(response.included)) return null;

  const includedTokens = new Map<string, { address: string; symbol: string; name?: string }>();
  for (const item of response.included) {
    if (!item || typeof item !== "object") continue;
    const resource = item as { id?: unknown; type?: unknown; attributes?: { address?: unknown; symbol?: unknown; name?: unknown } };
    if (resource.type !== "token" || typeof resource.id !== "string") continue;
    const address = resource.attributes?.address;
    const symbol = resource.attributes?.symbol;
    const name = resource.attributes?.name;
    if (typeof address === "string" && SOLANA_ADDRESS_PATTERN.test(address) &&
        typeof symbol === "string" && symbol.trim() &&
        resource.id === `solana_${address}`) {
      includedTokens.set(resource.id, {
        address,
        symbol: symbol.trim(),
        ...(typeof name === "string" ? { name } : {}),
      });
    }
  }

  const pairs: MarketPair[] = [];
  let malformedPools = 0;
  for (const item of response.data) {
    if (!item || typeof item !== "object") { malformedPools++; continue; }
    const pool = item as {
      id?: unknown;
      type?: unknown;
      attributes?: {
        address?: unknown;
        base_token_price_usd?: unknown;
        base_token_price_quote_token?: unknown;
        reserve_in_usd?: unknown;
        volume_usd?: { h24?: unknown };
        price_change_percentage?: { h24?: unknown };
      };
      relationships?: {
        base_token?: { data?: { id?: unknown } };
        quote_token?: { data?: { id?: unknown } };
        dex?: { data?: { id?: unknown } };
      };
    };
    const address = pool.attributes?.address;
    const baseTokenId = pool.relationships?.base_token?.data?.id;
    const quoteTokenId = pool.relationships?.quote_token?.data?.id;
    const dexId = pool.relationships?.dex?.data?.id;
    const baseToken = typeof baseTokenId === "string" ? includedTokens.get(baseTokenId) : undefined;
    const quoteToken = typeof quoteTokenId === "string" ? includedTokens.get(quoteTokenId) : undefined;
    if (pool.type !== "pool" || typeof address !== "string" || !SOLANA_ADDRESS_PATTERN.test(address) ||
        pool.id !== `solana_${address}` || !baseToken || !quoteToken ||
        typeof dexId !== "string" || !dexId.trim() ||
        (baseToken.address !== mint && quoteToken.address !== mint)) {
      malformedPools++;
      continue;
    }

    const basePriceUsd = readGeckoNumber(pool.attributes?.base_token_price_usd);
    const basePriceInQuote = readGeckoNumber(pool.attributes?.base_token_price_quote_token);
    const reserveUsd = readGeckoNumber(pool.attributes?.reserve_in_usd);
    const volume24hUsd = readGeckoNumber(pool.attributes?.volume_usd?.h24);
    const priceChange24hPct = readGeckoNumber(pool.attributes?.price_change_percentage?.h24);
    if ([basePriceUsd, basePriceInQuote, reserveUsd, volume24hUsd, priceChange24hPct].includes(INVALID_NUMBER)) {
      malformedPools++;
      continue;
    }

    pairs.push({
      chainId: "solana",
      dexId: dexId.trim(),
      pairAddress: address,
      baseToken,
      quoteToken,
      priceUsd: typeof basePriceUsd === "number" && basePriceUsd > 0 ? String(basePriceUsd) : undefined,
      priceNative: typeof basePriceInQuote === "number" && basePriceInQuote > 0 ? String(basePriceInQuote) : undefined,
      liquidity: {
        ...(typeof reserveUsd === "number" && reserveUsd >= 0 ? { usd: reserveUsd } : {}),
      },
      volume: {
        ...(typeof volume24hUsd === "number" && volume24hUsd >= 0 ? { h24: volume24hUsd } : {}),
      },
      priceChange: {
        ...(typeof priceChange24hPct === "number" ? { h24: priceChange24hPct } : {}),
      },
    });
  }

  return response.data.length > 0 && pairs.length === 0 && malformedPools > 0 ? null : pairs;
}

function aggregateWeeklyCandles(candles: OhlcvCandle[]): OhlcvCandle[] {
  const weeks = new Map<number, OhlcvCandle>();
  for (const candle of candles) {
    const date = new Date(candle.time * 1000);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    const weekTime = Math.floor(date.getTime() / 1000);
    const current = weeks.get(weekTime);
    if (!current) {
      weeks.set(weekTime, { ...candle, time: weekTime });
      continue;
    }
    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
    current.volume = current.volume == null || candle.volume == null ? null : current.volume + candle.volume;
  }
  return [...weeks.values()].sort((a, b) => a.time - b.time);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const action = searchParams.get("action");

  if (action === "pair") {
    const address = searchParams.get("pair") ?? "";
    if (!/^[1-9A-HJ-NP-Za-km-z]{20,64}$/.test(address)) {
      return NextResponse.json({ error: "Adresse de paire invalide." }, { status: 400 });
    }
    const expectedBaseMint = searchParams.get("base") ?? "";
    const expectedQuoteMint = searchParams.get("quote") ?? "";
    const matchesExpectedOrientation = (pair: PairQuote | null) => !pair || !SOLANA_ADDRESS_PATTERN.test(expectedBaseMint) ||
      (pair.baseMint === expectedBaseMint && (!SOLANA_ADDRESS_PATTERN.test(expectedQuoteMint) || pair.quoteMint === expectedQuoteMint));
    if (SOLANA_ADDRESS_PATTERN.test(expectedBaseMint) && SOLANA_ADDRESS_PATTERN.test(expectedQuoteMint)) {
      try {
        const tokenPairsResponse = await fetch(`${DEX_TOKEN_PAIRS_URL}/${encodeURIComponent(expectedBaseMint)}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        if (tokenPairsResponse.ok) {
          const tokenPairsPayload: unknown = await tokenPairsResponse.json().catch(() => null);
          const orientedPair = parseDexTokenPairsQuote(tokenPairsPayload, address);
          if (orientedPair && orientedPair.baseMint === expectedBaseMint && orientedPair.quoteMint === expectedQuoteMint) {
            return NextResponse.json({ pair: orientedPair }, { headers: { "Cache-Control": "no-store" } });
          }
        }
      } catch {
        // Fall back to the exact-pool providers below.
      }
    }
    const providerErrors: Array<{ provider: string; status?: number; error: string }> = [];
    let dexWasValidResponse = false;
    let dexPoolFound = false;
    let geckoPoolFound = false;
    let geckoPoolNotIndexed = false;
    try {
      const dexResponse = await fetch(`${DEX_PAIR_URL}/${encodeURIComponent(address)}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      });
      if (!dexResponse.ok) {
        providerErrors.push({ provider: "DexScreener", status: dexResponse.status, error: `HTTP ${dexResponse.status}` });
      } else {
        let dexPayload: unknown;
        try {
          dexPayload = await dexResponse.json();
        } catch {
          providerErrors.push({ provider: "DexScreener", error: "Réponse JSON malformée." });
          dexPayload = null;
        }
        if (dexPayload !== null) {
          const dexPairs: unknown[] | null = isRecord(dexPayload) && Array.isArray(dexPayload.pairs)
            ? dexPayload.pairs : null;
          dexWasValidResponse = dexPairs !== null;
          if (!dexWasValidResponse) {
            providerErrors.push({ provider: "DexScreener", error: "Réponse de marché malformée." });
          } else {
            dexPoolFound = dexPairs!.some((item) => isRecord(item) && item.pairAddress === address);
            const pair = parseDexPairQuote(dexPayload, address);
            if (pair && matchesExpectedOrientation(pair)) return NextResponse.json({ pair }, { headers: { "Cache-Control": "no-store" } });
            providerErrors.push({ provider: "DexScreener", error: dexPoolFound ? "Données du pool exact incomplètes ou invalides." : "Pool exact absent." });
          }
        }
      }
    } catch (error) {
      providerErrors.push({
        provider: "DexScreener",
        error: error instanceof Error && error.name === "TimeoutError" ? "Délai de réponse dépassé." : "Fournisseur temporairement inaccessible.",
      });
    }

    let geckoWasValidResponse = false;
    try {
      const geckoUrl = new URL(`${GECKO_BASE_URL}/networks/solana/pools/${encodeURIComponent(address)}`);
      geckoUrl.searchParams.set("include", "base_token,quote_token,dex");
      const geckoResponse = await fetch(geckoUrl, {
        cache: "no-store",
        headers: { accept: "application/json;version=20230302" },
        signal: AbortSignal.timeout(8_000),
      });
      if (!geckoResponse.ok) {
        geckoPoolNotIndexed = geckoResponse.status === 404;
        providerErrors.push({ provider: "GeckoTerminal", status: geckoResponse.status, error: `HTTP ${geckoResponse.status}` });
      } else {
        let geckoPayload: unknown;
        try {
          geckoPayload = await geckoResponse.json();
        } catch {
          providerErrors.push({ provider: "GeckoTerminal", error: "Réponse JSON malformée." });
          geckoPayload = null;
        }
        if (geckoPayload !== null) {
          const geckoData = isRecord(geckoPayload) && isRecord(geckoPayload.data) ? geckoPayload.data : null;
          geckoWasValidResponse = Boolean(geckoData && geckoData.type === "pool" && isRecord(geckoData.attributes));
          if (!geckoWasValidResponse) {
            providerErrors.push({ provider: "GeckoTerminal", error: "Réponse de pool malformée." });
          } else {
            geckoPoolFound = Boolean(geckoData && isRecord(geckoData.attributes) &&
              geckoData.id === `solana_${address}` && geckoData.attributes.address === address);
            const pair = parseGeckoPairQuote(geckoPayload, address);
            if (pair && matchesExpectedOrientation(pair)) return NextResponse.json({ pair }, { headers: { "Cache-Control": "no-store" } });
            providerErrors.push({ provider: "GeckoTerminal", error: geckoPoolFound ? "Données du pool exact incomplètes ou invalides." : "Pool exact absent." });
          }
        }
      }
    } catch (error) {
      providerErrors.push({
        provider: "GeckoTerminal",
        error: error instanceof Error && error.name === "TimeoutError" ? "Délai de réponse dépassé." : "Fournisseur temporairement inaccessible.",
      });
    }

    const hasRateLimit = providerErrors.some((item) => item.status === 429);
    const hasTimeout = providerErrors.some((item) => item.error === "Délai de réponse dépassé.");
    const noExactPool = !dexPoolFound && dexWasValidResponse && !geckoPoolFound &&
      (geckoWasValidResponse || geckoPoolNotIndexed) &&
      providerErrors.every((item) => item.error === "Pool exact absent." || (item.provider === "GeckoTerminal" && item.status === 404));
    const status = hasRateLimit ? 429 : noExactPool ? 404 : hasTimeout ? 504 : 502;
    return NextResponse.json({
      error: noExactPool
        ? "Le pool exact n’a fourni aucune cotation exploitable chez les deux fournisseurs."
        : hasRateLimit
          ? "Un fournisseur a limité temporairement les cotations (HTTP 429)."
          : hasTimeout
            ? "Délai dépassé pendant la récupération de la cotation du pool exact."
            : "La cotation du pool exact est temporairement indisponible.",
      providers: providerErrors,
    }, { status, headers: { "Cache-Control": "no-store" } });
  }

  if (action === "search") {
    const query = searchParams.get("query")?.trim();
    if (!query || query.length > 120) {
      return NextResponse.json({ error: "Saisis un symbole ou une adresse valide." }, { status: 400 });
    }

    const isMintAddress = SOLANA_ADDRESS_PATTERN.test(query);
    let candidates: unknown[];
    let dexResponse: Response;
    try {
      const endpoint = isMintAddress
        ? `${DEX_TOKEN_PAIRS_URL}/${encodeURIComponent(query)}`
        : `${DEX_SEARCH_URL}?q=${encodeURIComponent(query)}`;
      dexResponse = await fetch(endpoint, {
        ...(isMintAddress ? { cache: "no-store" as const } : { next: { revalidate: 30 } }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return NextResponse.json({ error: "DexScreener est temporairement indisponible." }, { status: 502 });
    }
    if (!dexResponse.ok) {
      return NextResponse.json(
        { error: dexResponse.status === 429 ? "DexScreener a limité temporairement les recherches." : `DexScreener est temporairement indisponible (HTTP ${dexResponse.status}).` },
        { status: dexResponse.status === 429 ? 429 : 502 },
      );
    }

    let dexPayload: unknown;
    try {
      dexPayload = await dexResponse.json();
    } catch {
      return NextResponse.json({ error: "La réponse DexScreener est malformée." }, { status: 502 });
    }
    if (isMintAddress) {
      if (!Array.isArray(dexPayload)) {
        return NextResponse.json({ error: "La réponse DexScreener est malformée." }, { status: 502 });
      }
      candidates = dexPayload;
    } else {
      if (!dexPayload || typeof dexPayload !== "object" || !Array.isArray((dexPayload as { pairs?: unknown }).pairs)) {
        return NextResponse.json({ error: "La réponse DexScreener est malformée." }, { status: 502 });
      }
      candidates = (dexPayload as { pairs: unknown[] }).pairs;
    }

    const pairsFromDexScreener = candidates.filter((candidate): candidate is MarketPair => {
      if (!candidate || typeof candidate !== "object") return false;
      const pair = candidate as Partial<MarketPair>;
      const baseAddress = pair.baseToken?.address;
      const quoteAddress = pair.quoteToken?.address;
      return pair.chainId === "solana" &&
        typeof pair.pairAddress === "string" && PAIR_ADDRESS_PATTERN.test(pair.pairAddress) &&
        typeof baseAddress === "string" && SOLANA_ADDRESS_PATTERN.test(baseAddress) &&
        typeof quoteAddress === "string" && SOLANA_ADDRESS_PATTERN.test(quoteAddress) &&
        typeof pair.baseToken?.symbol === "string" && pair.baseToken.symbol.trim().length > 0 &&
        typeof pair.quoteToken?.symbol === "string" && pair.quoteToken.symbol.trim().length > 0 &&
        (!isMintAddress || baseAddress === query || quoteAddress === query);
    });
    if (isMintAddress && candidates.length > 0 && pairsFromDexScreener.length === 0) {
      return NextResponse.json({ error: "La réponse DexScreener contient des paires malformées ou incompatibles avec le Mint demandé." }, { status: 502 });
    }

    let sourcePairs = pairsFromDexScreener;
    if (isMintAddress && pairsFromDexScreener.length === 0) {
      const geckoUrl = new URL(`${GECKO_BASE_URL}/networks/solana/tokens/${encodeURIComponent(query)}/pools`);
      geckoUrl.searchParams.set("include", "base_token,quote_token,dex");
      let geckoResponse: Response;
      try {
        geckoResponse = await fetch(geckoUrl, {
          headers: { accept: "application/json;version=20230302" },
          next: { revalidate: GECKO_POOL_CACHE_SECONDS },
          signal: AbortSignal.timeout(12_000),
        });
      } catch {
        return NextResponse.json({ error: "GeckoTerminal est temporairement indisponible pour la recherche complémentaire." }, { status: 502 });
      }
      if (!geckoResponse.ok) {
        return NextResponse.json(
          { error: geckoResponse.status === 429 ? "GeckoTerminal a limité temporairement les recherches." : `GeckoTerminal est temporairement indisponible (HTTP ${geckoResponse.status}).` },
          { status: geckoResponse.status === 429 ? 429 : 502 },
        );
      }

      let geckoPayload: unknown;
      try {
        geckoPayload = await geckoResponse.json();
      } catch {
        return NextResponse.json({ error: "La réponse GeckoTerminal est malformée." }, { status: 502 });
      }
      const geckoPairs = parseGeckoPools(geckoPayload, query);
      if (geckoPairs === null) {
        return NextResponse.json({ error: "La réponse GeckoTerminal est malformée ou contient des pools incompatibles avec le Mint demandé." }, { status: 502 });
      }
      sourcePairs = geckoPairs;
    }

    const pairs = sourcePairs
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
      .slice(0, 12)
      .map((pair) => ({
        address: pair.pairAddress,
        network: pair.chainId,
        dexId: pair.dexId ?? null,
        tokenAddress: pair.baseToken.address ?? "",
        baseMint: pair.baseToken.address ?? "",
        quoteMint: pair.quoteToken.address ?? "",
        base: pair.baseToken.symbol,
        quote: pair.quoteToken.symbol,
        priceUsd: pair.priceUsd ?? null,
        priceNative: pair.priceNative ?? null,
        liquidityUsd: pair.liquidity?.usd ?? null,
        liquidityBase: pair.liquidity?.base ?? null,
        liquidityQuote: pair.liquidity?.quote ?? null,
        volume24hUsd: pair.volume?.h24 ?? null,
        priceChange24hPct: pair.priceChange?.h24 ?? null,
      }));

    return NextResponse.json({ pairs });
  }

  if (action === "candles") {
    const address = searchParams.get("pair") ?? "";
    const tokenAddress = searchParams.get("token") ?? "";
    const intervalName = searchParams.get("interval") as keyof typeof candleIntervals | null;
    const rangeName = searchParams.get("range") as keyof typeof historyRanges | null;
    if (!/^[1-9A-HJ-NP-Za-km-z]{20,64}$/.test(address) || !/^[1-9A-HJ-NP-Za-km-z]{20,64}$/.test(tokenAddress) || !intervalName || !(intervalName in candleIntervals) || !rangeName || !(rangeName in historyRanges)) {
      return NextResponse.json({ error: "Paire ou période invalide." }, { status: 400 });
    }

    const interval = candleIntervals[intervalName];
    const rangeSeconds = historyRanges[rangeName];
    const wantedCandles = Math.ceil(rangeSeconds / interval.seconds) + 99;
    const limit = Math.min(wantedCandles, MAX_CANDLES_PER_REQUEST);
    const url = new URL(`${GECKO_BASE_URL}/networks/solana/pools/${encodeURIComponent(address)}/ohlcv/${interval.timeframe}`);
    url.searchParams.set("aggregate", interval.aggregate);
    url.searchParams.set("limit", String(intervalName === "1w" ? Math.min(MAX_CANDLES_PER_REQUEST, limit * 7) : limit));
    url.searchParams.set("currency", "usd");
    url.searchParams.set("token", tokenAddress);
    try {
      const upstream = await fetch(url, {
        headers: { accept: "application/json" },
        next: { revalidate: 15 },
        signal: AbortSignal.timeout(12_000),
      });
      if (upstream.status === 429) {
        const retryAfter = validRetryAfter(upstream.headers.get("Retry-After"));
        return NextResponse.json(
          { error: "Limite temporaire de l’API OHLCV atteinte. Réessaie dans un instant." },
          { status: 429, headers: retryAfter ? { "Retry-After": retryAfter } : undefined },
        );
      }
      if (!upstream.ok) return NextResponse.json({ error: "Historique OHLCV indisponible pour ce pool." }, { status: 502 });
      const payload = (await upstream.json()) as {
        data?: { attributes?: { ohlcv_list?: unknown[][] } };
      };
      const rows = payload.data?.attributes?.ohlcv_list ?? [];
      const parsed = rows
        .filter((row) => row.length >= 5 && row.slice(0, 5).every((value) => Number.isFinite(Number(value))))
        .map((row) => ({
          time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]),
          volume: row.length > 5 && Number.isFinite(Number(row[5])) ? Number(row[5]) : null,
        }))
        .filter((candle) => candle.time > 0 && candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0 && candle.high >= candle.low)
        .sort((a, b) => a.time - b.time);
      const candles = (intervalName === "1w" ? aggregateWeeklyCandles(parsed) : parsed)
        .filter((candle) => candle.time + interval.seconds > Math.floor(Date.now() / 1000) - rangeSeconds);

      return NextResponse.json({
        candles,
        source: { network: "solana", poolAddress: address, provider: "GeckoTerminal" },
        interval: intervalName,
        range: rangeName,
        limited: wantedCandles > MAX_CANDLES_PER_REQUEST,
      }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const isAbort = error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
      return NextResponse.json({ error: isAbort ? "La demande OHLCV a expiré. Réessaie." : "Impossible de récupérer l’historique OHLCV actuellement." }, { status: isAbort ? 504 : 502 });
    }
  }

  return NextResponse.json({ error: "Action invalide." }, { status: 400 });
}
