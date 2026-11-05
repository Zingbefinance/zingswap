"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { ExternalLink } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { findAllowedTradingTokenByMint } from "./allowedTokens";

const chartPeriods = ["24H", "7D", "30D", "180D"] as const;
const candleCacheDurationMs = 15_000;
const maxInitial429Retries = 3;
const initial429FallbackDelayMs = 2_000;
const maxInitial429FallbackDelayMs = 30_000;
const maxTimeoutDelayMs = 2_147_000_000;
const maxPricePrecision = 20;

type Period = (typeof chartPeriods)[number];
type CandleInterval = "15m" | "1h" | "4h" | "1d";
type Candle = CandlestickData<UTCTimestamp>;
type ApiCandle = { time: number; open: number; high: number; low: number; close: number };
type LoadState = {
  key: string;
  status: "ready" | "empty" | "error" | "retrying";
  candles: Candle[];
  limited?: boolean;
  message?: string;
};
type CandleRefreshError = { key: string; message: string } | null;

const intervalByPeriod: Record<Period, CandleInterval> = {
  "24H": "15m",
  "7D": "1h",
  "30D": "4h",
  "180D": "1d",
};
const candleCache = new Map<string, { candles: Candle[]; limited: boolean; expiresAt: number }>();
const refreshIntervalByCandle: Record<CandleInterval, number> = {
  "15m": 60_000,
  "1h": 120_000,
  "4h": 180_000,
  "1d": 300_000,
};

function sameCandle(left: Candle, right: Candle): boolean {
  return left.open === right.open && left.high === right.high && left.low === right.low && left.close === right.close;
}

function priceFormatForCandles(candles: Candle[]) {
  const smallestPrice = candles.reduce((smallest, candle) => {
    return Math.min(smallest, candle.open, candle.high, candle.low, candle.close);
  }, Number.POSITIVE_INFINITY);
  const extraDigits = smallestPrice < 0.0001 ? 4 : 3;
  const precision = Number.isFinite(smallestPrice) && smallestPrice > 0
    ? Math.max(2, Math.min(maxPricePrecision, Math.ceil(-Math.log10(smallestPrice)) + extraDigits))
    : 2;

  return { type: "price" as const, precision, minMove: 10 ** -precision };
}

function applyRefreshedCandles(
  series: ISeriesApi<"Candlestick">,
  chart: IChartApi,
  previous: Candle[],
  incoming: Candle[],
): "updated" | "resynced" | "stale" {
  if (!incoming.length) return "stale";
  if (!previous.length) {
    series.setData(incoming);
    return "resynced";
  }

  const previousLast = previous[previous.length - 1];
  const incomingLast = incoming[incoming.length - 1];
  if (Number(incomingLast.time) < Number(previousLast.time)) return "stale";

  const incomingByTime = new Map(incoming.map((candle) => [Number(candle.time), candle]));
  let historyChanged = Number(incoming[0].time) !== Number(previous[0].time);
  for (let index = 0; index < previous.length && !historyChanged; index++) {
    const oldCandle = previous[index];
    const nextCandle = incomingByTime.get(Number(oldCandle.time));
    if (!nextCandle || (index < previous.length - 1 && !sameCandle(oldCandle, nextCandle))) {
      historyChanged = true;
    }
  }

  if (historyChanged) {
    const timeScale = chart.timeScale();
    const visibleRange = timeScale.getVisibleRange();
    series.setData(incoming);
    if (visibleRange) {
      try { timeScale.setVisibleRange(visibleRange); } catch { /* Keep Lightweight Charts' adjusted range if the old range no longer exists. */ }
    }
    return "resynced";
  }

  const revisedLast = incomingByTime.get(Number(previousLast.time));
  if (!revisedLast) return "stale";
  series.update(revisedLast);
  for (const candle of incoming) {
    if (Number(candle.time) > Number(previousLast.time)) series.update(candle);
  }
  return "updated";
}

function retryAfterMilliseconds(response: Response): number | null {
  const value = response.headers.get("Retry-After");
  if (!value) return null;

  if (/^\d+$/.test(value)) {
    const milliseconds = Number(value) * 1000;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }

  const imfFixdate = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;
  const rfc850Date = /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{2}:\d{2}:\d{2}) GMT$/;
  const asctimeDate = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([ 0-9]\d) (\d{2}:\d{2}:\d{2}) (\d{4})$/;
  const rfc850Match = rfc850Date.exec(value);
  const asctimeMatch = asctimeDate.exec(value);
  if (!imfFixdate.test(value) && !rfc850Match && !asctimeMatch) return null;

  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;

  const parsed = new Date(date);
  if (imfFixdate.test(value) && parsed.toUTCString() !== value) return null;
  if (rfc850Match) {
    const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    if (rfc850Match[1] !== weekdays[parsed.getUTCDay()] || rfc850Match[2] !== String(parsed.getUTCDate()).padStart(2, "0") ||
        rfc850Match[3] !== ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parsed.getUTCMonth()] ||
        rfc850Match[4] !== String(parsed.getUTCFullYear()).slice(-2) ||
        rfc850Match[5] !== `${String(parsed.getUTCHours()).padStart(2, "0")}:${String(parsed.getUTCMinutes()).padStart(2, "0")}:${String(parsed.getUTCSeconds()).padStart(2, "0")}`) return null;
  }
  if (asctimeMatch) {
    if (asctimeMatch[1] !== ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][parsed.getUTCDay()] ||
        asctimeMatch[2] !== ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][parsed.getUTCMonth()] ||
        asctimeMatch[3] !== String(parsed.getUTCDate()).padStart(2, " ") ||
        asctimeMatch[4] !== `${String(parsed.getUTCHours()).padStart(2, "0")}:${String(parsed.getUTCMinutes()).padStart(2, "0")}:${String(parsed.getUTCSeconds()).padStart(2, "0")}` ||
        asctimeMatch[5] !== String(parsed.getUTCFullYear())) return null;
  }
  return Math.max(0, date - Date.now());
}

type TradingChartProps = {
  pairAddress: string;
  baseMint: string;
  pairName: string;
  currentPrice: number | null;
  period: string;
  onPeriodChange: (period: string) => void;
};

function isCanonicalAddress(value: string): boolean {
  try { return new PublicKey(value).toBase58() === value; } catch { return false; }
}

function parseCandles(value: unknown): Candle[] {
  if (!Array.isArray(value)) return [];

  const byTimestamp = new Map<number, Candle>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const candle = item as Partial<ApiCandle>;
    if (![candle.time, candle.open, candle.high, candle.low, candle.close].every((field) => typeof field === "number")) continue;
    const time = Number(candle.time);
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);

    if (
      !Number.isSafeInteger(time) || time <= 0 || time > Math.floor(Date.now() / 1000) + 60 ||
      ![open, high, low, close].every((price) => Number.isFinite(price) && price > 0) ||
      high < Math.max(open, close, low) || low > Math.min(open, close, high)
    ) continue;

    byTimestamp.set(time, { time: time as UTCTimestamp, open, high, low, close });
  }

  return [...byTimestamp.values()].sort((a, b) => Number(a.time) - Number(b.time));
}

export default function TradingChart({ pairAddress, baseMint, pairName, currentPrice, period, onPeriodChange }: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const candleDataRef = useRef<Candle[]>([]);
  const liveCandleRef = useRef<Candle | null>(null);
  const fittedSelectionKeyRef = useRef<string | null>(null);
  const isValidPeriod = chartPeriods.includes(period as Period);
  const requestInterval: CandleInterval = isValidPeriod ? intervalByPeriod[period as Period] : "15m";
  const requestKey = `${pairAddress}:${baseMint}:${requestInterval}:${period}`;
  const [loadState, setLoadState] = useState<LoadState | null>(null);
  const [refreshError, setRefreshError] = useState<CandleRefreshError>(null);
  const [manualRetrySequence, setManualRetrySequence] = useState(0);
  const pairIsValid = isCanonicalAddress(pairAddress);
  const mintIsValid = isCanonicalAddress(baseMint) && Boolean(findAllowedTradingTokenByMint(baseMint)?.canBeBase);
  const isLoading = loadState?.key !== requestKey && pairIsValid && mintIsValid && isValidPeriod;
  const activeState = loadState?.key === requestKey ? loadState : null;
  const activeStateKey = activeState?.key ?? null;
  const activeStateStatus = activeState?.status ?? null;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      width: Math.max(container.clientWidth, 1),
      height: container.clientHeight || 420,
      layout: {
        background: { color: "#0b0e11" },
        textColor: "#a1a1aa",
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: "rgba(63, 63, 70, 0.35)" },
        horzLines: { color: "rgba(63, 63, 70, 0.55)" },
      },
      rightPriceScale: { autoScale: true, borderColor: "#3f3f46" },
      timeScale: {
        borderColor: "#3f3f46",
        timeVisible: true,
        secondsVisible: false,
        minBarSpacing: 0.25,
        rightOffset: 4,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      priceLineVisible: true,
      priceFormat: priceFormatForCandles([]),
    });

    chartRef.current = chart;
    candleSeriesRef.current = series;

    const resizeChart = () => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth > 0 && clientHeight > 0) chart.applyOptions({ width: clientWidth, height: clientHeight });
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resizeChart) : null;
    observer?.observe(container);
    window.addEventListener("resize", resizeChart);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", resizeChart);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let retryTimer: number | null = null;
    let cancelRetry: (() => void) | null = null;

    const waitForRetry = (delay: number) => new Promise<void>((resolve) => {
      const retryAt = Date.now() + delay;
      const scheduleNext = () => {
        const remaining = retryAt - Date.now();
        if (remaining <= 0) {
          retryTimer = null;
          cancelRetry = null;
          resolve();
          return;
        }
        retryTimer = window.setTimeout(scheduleNext, Math.min(remaining, maxTimeoutDelayMs));
      };
      cancelRetry = () => {
        if (retryTimer !== null) window.clearTimeout(retryTimer);
        retryTimer = null;
        cancelRetry = null;
        resolve();
      };
      scheduleNext();
    });

    async function loadCandles() {
      if (!pairIsValid || !mintIsValid || !isValidPeriod) {
        await Promise.resolve();
        if (active) {
          setLoadState({ key: requestKey, status: "error", candles: [], message: "L’adresse du pool, le mint de base ou la plage est invalide." });
        }
        return;
      }

      try {
        setLoadState((current) => current?.key === requestKey ? null : current);
        const cached = candleCache.get(requestKey);
        if (cached && cached.expiresAt > Date.now()) {
          await Promise.resolve();
          if (active) {
            setRefreshError(null);
            setLoadState({ key: requestKey, status: cached.candles.length ? "ready" : "empty", candles: cached.candles, limited: cached.limited });
          }
          return;
        }

        for (let attempt = 0; attempt <= maxInitial429Retries; attempt++) {
          if (attempt > 0) {
            setLoadState({
              key: requestKey,
              status: "retrying",
              candles: [],
              message: "Nouvelle tentative en cours après la limitation temporaire de GeckoTerminal…",
            });
          }
          const params = new URLSearchParams({
            action: "candles",
            pair: pairAddress,
            token: baseMint,
            interval: requestInterval,
            range: period,
          });
          const response = await fetch(`/api/analytics?${params.toString()}`, { signal: controller.signal });
          const payload = await response.json().catch(() => ({})) as { candles?: unknown; error?: string; limited?: boolean };
          if (!active || controller.signal.aborted) return;

          if (response.status === 429) {
            if (attempt === maxInitial429Retries) {
              throw new Error("GeckoTerminal limite temporairement les requêtes. Les tentatives automatiques sont épuisées; vous pouvez réessayer.");
            }
            const fallbackDelay = Math.min(
              initial429FallbackDelayMs * (2 ** attempt),
              maxInitial429FallbackDelayMs,
            );
            const retryDelay = retryAfterMilliseconds(response) ?? fallbackDelay;
            setLoadState({
              key: requestKey,
              status: "retrying",
              candles: [],
              message: `GeckoTerminal limite temporairement les requêtes. Nouvelle tentative dans ${Math.ceil(retryDelay / 1000)} s.`,
            });
            await waitForRetry(retryDelay);
            if (!active || controller.signal.aborted) return;
            continue;
          }
          if (!response.ok) {
            throw new Error(payload.error ?? `Impossible de charger les bougies (HTTP ${response.status}).`);
          }

          const candles = parseCandles(payload.candles);
          const limited = payload.limited === true;
          candleCache.set(requestKey, { candles, limited, expiresAt: Date.now() + candleCacheDurationMs });
          if (candleCache.size > 24) candleCache.delete(candleCache.keys().next().value as string);
          setRefreshError(null);
          setLoadState({ key: requestKey, status: candles.length ? "ready" : "empty", candles, limited });
          return;
        }
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        setLoadState({
          key: requestKey,
          status: "error",
          candles: [],
          message: error instanceof Error ? error.message : "Impossible de charger l’historique OHLCV.",
        });
      }
    }

    void loadCandles();
    return () => {
      active = false;
      controller.abort();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      cancelRetry?.();
    };
  }, [pairAddress, baseMint, period, requestInterval, requestKey, pairIsValid, mintIsValid, isValidPeriod, manualRetrySequence]);

  useEffect(() => {
    if (activeStateKey !== requestKey || activeStateStatus !== "ready" || !pairIsValid || !mintIsValid || !isValidPeriod) return;

    const baseDelay = refreshIntervalByCandle[requestInterval];
    let timer: number | null = null;
    let controller: AbortController | null = null;
    let inFlight = false;
    let disposed = false;
    let failures = 0;

    const schedule = (delay: number) => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
      if (!disposed && !document.hidden) timer = window.setTimeout(() => void refresh(), delay);
    };

    const refresh = async () => {
      if (disposed || document.hidden || inFlight) return;
      inFlight = true;
      const requestController = new AbortController();
      controller = requestController;
      let retryAfter: number | null = null;
      try {
        const params = new URLSearchParams({ action: "candles", pair: pairAddress, token: baseMint, interval: requestInterval, range: period });
        const response = await fetch(`/api/analytics?${params.toString()}`, { cache: "no-store", signal: requestController.signal });
        if (response.status === 429) retryAfter = retryAfterMilliseconds(response);
        const payload = await response.json().catch(() => ({})) as { candles?: unknown; error?: string; limited?: boolean };
        if (!response.ok) throw new Error(response.status === 429
          ? "GeckoTerminal limite temporairement l’actualisation des bougies."
          : payload.error ?? `Actualisation des bougies impossible (HTTP ${response.status}).`);

        const incoming = parseCandles(payload.candles);
        if (!incoming.length) throw new Error("Aucune nouvelle donnée OHLCV reçue ; les bougies affichées sont conservées.");
        if (disposed || requestController.signal.aborted || requestKey !== `${pairAddress}:${baseMint}:${requestInterval}:${period}`) return;

        const series = candleSeriesRef.current;
        const chart = chartRef.current;
        if (!series || !chart) throw new Error("Le graphique n’est pas disponible pour appliquer les nouvelles bougies.");
        series.applyOptions({ priceFormat: priceFormatForCandles(incoming) });
        const liveCandle = liveCandleRef.current;
        let result: "updated" | "resynced" | "stale";
        if (liveCandle) {
          const timeScale = chart.timeScale();
          const visibleRange = timeScale.getVisibleRange();
          const incomingLastTime = Number(incoming[incoming.length - 1].time);
          const keepLiveCandle = Number(liveCandle.time) > incomingLastTime;
          series.setData(keepLiveCandle ? [...incoming, liveCandle] : incoming);
          if (visibleRange) {
            try { timeScale.setVisibleRange(visibleRange); } catch { /* Keep the adjusted range if the refreshed data changed its bounds. */ }
          }
          if (!keepLiveCandle) liveCandleRef.current = null;
          result = "resynced";
        } else {
          result = applyRefreshedCandles(series, chart, candleDataRef.current, incoming);
        }
        if (result === "stale") throw new Error("La réponse OHLCV est plus ancienne ; les bougies affichées sont conservées.");

        candleDataRef.current = incoming;
        candleCache.set(requestKey, { candles: incoming, limited: payload.limited === true, expiresAt: Date.now() + candleCacheDurationMs });
        if (candleCache.size > 24) candleCache.delete(candleCache.keys().next().value as string);
        failures = 0;
        setRefreshError(null);
        schedule(baseDelay);
      } catch (error) {
        if (disposed || requestController.signal.aborted) return;
        failures++;
        setRefreshError({ key: requestKey, message: error instanceof Error ? error.message : "Actualisation OHLCV temporairement indisponible." });
        const exponentialDelay = Math.min(baseDelay * (2 ** Math.min(failures, 6)), 15 * 60_000);
        schedule(Math.max(exponentialDelay, retryAfter ?? 0));
      } finally {
        if (controller === requestController) {
          controller = null;
          inFlight = false;
        }
      }
    };

    schedule(baseDelay);
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        controller?.abort();
        controller = null;
        inFlight = false;
      } else {
        schedule(0);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeStateKey, activeStateStatus, baseMint, isValidPeriod, mintIsValid, pairAddress, pairIsValid, period, requestInterval, requestKey]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series) return;

    if (activeState?.status === "ready") {
      const chart = chartRef.current;
      const timeScale = chart?.timeScale();
      const isNewSelection = fittedSelectionKeyRef.current !== activeState.key;
      if (isNewSelection) liveCandleRef.current = null;
      const previousVisibleRange = isNewSelection ? null : timeScale?.getVisibleLogicalRange() ?? null;
      series.applyOptions({ priceFormat: priceFormatForCandles(activeState.candles) });
      series.setData(activeState.candles);
      candleDataRef.current = activeState.candles;
      if (timeScale && isNewSelection) {
        timeScale.fitContent();
        fittedSelectionKeyRef.current = activeState.key;
      } else if (timeScale && previousVisibleRange) {
        timeScale.setVisibleLogicalRange(previousVisibleRange);
      }
    } else {
      series.setData([]);
      candleDataRef.current = [];
      liveCandleRef.current = null;
      fittedSelectionKeyRef.current = null;
    }
  }, [activeState]);

  useEffect(() => {
    if (!Number.isFinite(currentPrice) || currentPrice === null || currentPrice <= 0 || activeStateStatus !== "ready") return;
    const series = candleSeriesRef.current;
    const candles = candleDataRef.current;
    if (!series || candles.length === 0) return;

    const lastCandle = candles[candles.length - 1];
    const secondsByInterval: Record<CandleInterval, number> = { "15m": 900, "1h": 3_600, "4h": 14_400, "1d": 86_400 };
    const bucketSeconds = secondsByInterval[requestInterval];
    const bucketTime = Math.floor(Date.now() / (bucketSeconds * 1000)) * bucketSeconds;
    if (bucketTime < Number(lastCandle.time)) return;
    const previousLive = liveCandleRef.current;
    const previous = previousLive && Number(previousLive.time) <= bucketTime && Number(previousLive.time) > Number(lastCandle.time)
      ? previousLive
      : lastCandle;
    const sameLiveBucket = previousLive && Number(previousLive.time) === bucketTime;
    const liveCandle: Candle = {
      time: bucketTime as UTCTimestamp,
      open: sameLiveBucket ? previous.open : bucketTime === Number(lastCandle.time) ? lastCandle.open : previous.close,
      high: Math.max(sameLiveBucket ? previous.high : bucketTime === Number(lastCandle.time) ? lastCandle.high : previous.close, currentPrice),
      low: Math.min(sameLiveBucket ? previous.low : bucketTime === Number(lastCandle.time) ? lastCandle.low : previous.close, currentPrice),
      close: currentPrice,
    };

    series.update(liveCandle);
    liveCandleRef.current = liveCandle;
  }, [activeStateKey, activeStateStatus, currentPrice, requestInterval]);

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3 sm:px-5">
        <div>
          <h2 className="font-semibold text-white">Graphique · {pairName}</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Prix du pool · 2 s · Historique {period} · Bougies {requestInterval}</p>
          {activeState?.status === "ready" && activeState.limited && <p className="mt-1 text-xs text-amber-300/80">Historique partiel : limite de bougies de l’API atteinte.</p>}
          {refreshError?.key === requestKey && <p className="mt-1 text-xs text-amber-300/90" role="status">Actualisation différée : {refreshError.message}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-zinc-900 p-1" aria-label="Plage d’historique du graphique">
            {chartPeriods.map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => onPeriodChange(value)} className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${period === value ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}>{value}</button>)}
          </div>
          {pairIsValid && <a href={`https://dexscreener.com/solana/${encodeURIComponent(pairAddress)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-2.5 py-2 text-xs text-zinc-300 hover:border-cyan-600 hover:text-white"><ExternalLink size={13} /> DexScreener</a>}
        </div>
      </header>
      <div className="relative h-[420px] w-full bg-[#0b0e11] sm:h-[520px]">
        <div ref={containerRef} className="absolute inset-0" role="img" aria-label={`Graphique en chandeliers ${pairName}`} />
        {(isLoading || activeState?.status === "retrying") && <div className="absolute inset-0 flex items-center justify-center bg-[#0b0e11]/75 p-6 text-center text-sm text-zinc-300" role="status">{activeState?.status === "retrying" ? activeState.message : <><span className="mr-2 inline-block size-4 animate-spin rounded-full border-2 border-zinc-600 border-t-cyan-400" />Chargement des bougies…</>}</div>}
        {!isLoading && activeState?.status === "empty" && <div className="absolute inset-0 flex items-center justify-center bg-[#0b0e11]/80 p-6 text-center text-sm text-zinc-400" role="status">Aucune bougie disponible pour ce pool et cette plage.</div>}
        {!isLoading && activeState?.status === "error" && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b0e11]/80 p-6 text-center text-sm text-amber-200" role="alert"><p>{activeState.message}</p><button type="button" onClick={() => setManualRetrySequence((current) => current + 1)} className="rounded-lg border border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-100 transition hover:bg-amber-950/60">Réessayer</button></div>}
      </div>
    </section>
  );
}
