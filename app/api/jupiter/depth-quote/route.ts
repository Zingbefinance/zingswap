import { NextResponse } from "next/server";

export const maxDuration = 15;

const JUPITER_ORDER_URL = "https://api.jup.ag/swap/v2/order";
const JUPITER_V1_QUOTE_URL = "https://api.jup.ag/swap/v1/quote";
const MINT_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UNSIGNED_INTEGER_PATTERN = /^\d+$/;

function normalizeInteger(value: string) {
  return value.replace(/^0+(?=\d)/, "");
}

function isPositiveInteger(value: string) {
  return UNSIGNED_INTEGER_PATTERN.test(value) && /[1-9]/.test(value);
}

type JupiterQuote = {
  inAmount?: string;
  outAmount?: string;
  inputMint?: string;
  outputMint?: string;
  error?: string;
  errorCode?: number;
};

function cleanMessage(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/(x-api-key|api[_-]?key|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

export async function POST(request: Request) {
  const apiKey = process.env.JUPITER_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "La configuration de cotation Jupiter est indisponible." }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { inputMint, outputMint, amount, slippageBps } = body;
    if (
      typeof inputMint !== "string" || !MINT_PATTERN.test(inputMint) ||
      typeof outputMint !== "string" || !MINT_PATTERN.test(outputMint) ||
      inputMint === outputMint || typeof amount !== "string" ||
      !isPositiveInteger(amount) ||
      ![10, 50, 100, 300].includes(slippageBps)
    ) {
      return NextResponse.json({ error: "Paramètres de profondeur invalides." }, { status: 400 });
    }

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      slippageBps: String(slippageBps),
    });
    let response = await fetch(`${JUPITER_ORDER_URL}?${params}`, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
    });
    let payload = await response.json().catch(() => ({})) as JupiterQuote;

    // The current quote-only order is the primary path. Keep a read-only V1
    // quote fallback for Jupiter 400 responses so the depth panel can still
    // render an estimate when a pair is rejected by the Meta-Aggregator.
    if (response.status === 400) {
      const fallbackParams = new URLSearchParams(params);
      fallbackParams.set("restrictIntermediateTokens", "true");
      response = await fetch(`${JUPITER_V1_QUOTE_URL}?${fallbackParams}`, {
        headers: { "x-api-key": apiKey },
        cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(12_000)]),
      });
      payload = await response.json().catch(() => ({})) as JupiterQuote;
    }

    if (!response.ok) {
      const detail = cleanMessage(payload.error);
      const message = response.status === 429
        ? "Limite de cotations Jupiter atteinte. Réessayez dans un instant."
        : response.status === 401 || response.status === 403
          ? "Jupiter a refusé la clé API de cotation."
          : response.status === 400 && detail
            ? `Jupiter ne peut pas coter cette paire ou ce montant : ${detail}`
            : `La cotation de profondeur Jupiter est indisponible (HTTP ${response.status}).`;
      return NextResponse.json({ error: message }, { status: response.status === 429 ? 429 : 502 });
    }

    if (!payload.inAmount || !UNSIGNED_INTEGER_PATTERN.test(payload.inAmount) || normalizeInteger(payload.inAmount) !== normalizeInteger(amount) ||
      !payload.outAmount || !isPositiveInteger(payload.outAmount) ||
      (payload.inputMint && payload.inputMint !== inputMint) ||
      (payload.outputMint && payload.outputMint !== outputMint)) {
      return NextResponse.json({ error: "Jupiter n’a fourni aucune cotation exploitable pour cette taille." }, { status: 404 });
    }

    return NextResponse.json({ amountInRaw: payload.inAmount, amountOutRaw: payload.outAmount }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json({ error: "La cotation Jupiter a expiré. Réessayez dans un instant." }, { status: 504 });
    }
    return NextResponse.json({ error: "Le service de cotation Jupiter est injoignable." }, { status: 502 });
  }
}
