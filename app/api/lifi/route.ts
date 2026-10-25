import { NextRequest, NextResponse } from "next/server";
import { LIFI_SOL_NATIVE_ADDRESS, LIFI_SOLANA_CHAIN_ID } from "@/lib/lifi/chains";

const LIFI_API = "https://li.quest/v1";
const ALLOWED_CHAINS = new Set(["1", "56", String(LIFI_SOLANA_CHAIN_ID)]);
const ZINGSWAP_INTEGRATOR = "zingswap";
const ZINGSWAP_FEE = "0.0025";

function confirmsIntegratorFee(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const estimate = (payload as { estimate?: { feeCosts?: unknown } }).estimate;
  if (!Array.isArray(estimate?.feeCosts)) return false;
  return estimate.feeCosts.some((feeCost) => {
    if (!feeCost || typeof feeCost !== "object") return false;
    const { percentage, amount, feeSplit } = feeCost as {
      percentage?: unknown;
      amount?: unknown;
      feeSplit?: { integratorFee?: unknown };
    };
    if (typeof percentage !== "string" && typeof percentage !== "number") return false;
    if (typeof amount !== "string" && typeof amount !== "number") return false;
    const positiveAmount = Number(amount);
    const integratorFee = Number(feeSplit?.integratorFee);
    if (!Number.isFinite(positiveAmount) || positiveAmount <= 0 || !Number.isFinite(integratorFee) || integratorFee <= 0) return false;
    const parsed = Number(String(percentage).replace(/%$/, ""));
    const normalized = String(percentage).endsWith("%") ? parsed / 100 : parsed;
    return Number.isFinite(normalized) && Math.abs(normalized - Number(ZINGSWAP_FEE)) < 1e-9;
  });
}

function validAddress(chainId: string, address: string) {
  if (Number(chainId) === LIFI_SOLANA_CHAIN_ID) {
    return address === LIFI_SOL_NATIVE_ADDRESS || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }
  return /^0x[\da-fA-F]{40}$/.test(address);
}

function sanitizeUpstreamMessage(value: unknown) {
  if (typeof value !== "string") return undefined;
  return value
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\bheaders?\s*[:=]\s*(?:\{[^}]*\}|[^\r\n]*)/gi, "headers: [redacted]")
    .replace(/(authorization|proxy-authorization|cookie|set-cookie|x-[\w-]*api[\w-]*key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|private[_-]?key)(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1$2[redacted]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => url.split(/[?#]/, 1)[0])
    .replace(/\b0x[\da-f]{40,64}\b/gi, "[address redacted]")
    .replace(/\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g, "[address redacted]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email redacted]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 500);
}

function classifyUpstreamError(status: number, payload: unknown) {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const errors = Array.isArray(body.errors) ? body.errors.filter((entry) => entry && typeof entry === "object") as Array<Record<string, unknown>> : [];
  const rawCodes = [body.code, body.errorCode, ...errors.map((entry) => entry.code ?? entry.errorCode), body.statusCode];
  const codes = rawCodes.filter((code): code is string | number => typeof code === "string" || typeof code === "number");
  const code = codes[0];
  const messageValues = [body.message, body.error, ...errors.flatMap((entry) => [entry.message, entry.error])];
  const messages = messageValues.flatMap((value) => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === "string");
  const normalized = `${codes.join(" ")} ${messages.join(" ")}`.toLowerCase().replace(/[_-]+/g, " ");

  if (codes.some((value) => String(value) === "1005") || status === 429) return { type: "rate_limit", label: "Limite de requêtes LI.FI atteinte.", code };
  if (codes.some((value) => String(value) === "1001") || /insufficient (funds|balance)|not enough funds/.test(normalized)) {
    return { type: "insufficient_balance", label: "LI.FI indique un solde source insuffisant.", code };
  }
  if (/no (available )?routes?|routes? (were?|are?) not found|no quotes?|cannot find (an? )?route|could not find (an? )?route/.test(normalized)) {
    return { type: "no_route", label: "LI.FI n’a trouvé aucune route pour cette paire et ce montant.", code };
  }
  if (status === 400) return { type: "invalid_request", label: "LI.FI a rejeté les paramètres transmis.", code };
  if (status === 422) return { type: "invalid_request", label: "LI.FI ne peut pas traiter ces paramètres ou ce token.", code };
  if (status === 401 || status === 403) return { type: "authentication", label: "LI.FI a refusé la requête ou sa configuration d’accès.", code };
  if (status >= 500) return { type: "upstream_unavailable", label: "Le service LI.FI ou un fournisseur de route est indisponible.", code };
  if (status === 404) return { type: "upstream_not_found", label: "LI.FI n’a pas reconnu cette paire ou cette requête; l’absence de route n’est pas confirmée.", code };
  return { type: "upstream_error", label: "LI.FI a renvoyé une erreur; l’absence de route n’est pas confirmée.", code };
}

function headers() {
  const result = new Headers({ Accept: "application/json" });
  const apiKey = process.env.LIFI_API_KEY;
  if (apiKey) result.set("x-lifi-api-key", apiKey);
  return result;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const resource = params.get("resource");
  const fromChain = params.get("fromChain");
  const toChain = params.get("toChain");
  const usesEvmFee = fromChain === "1" || fromChain === "56" || toChain === "1" || toChain === "56";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    let url: URL;
    if (resource === "tokens") {
      const chainId = params.get("chainId") ?? "";
      if (!ALLOWED_CHAINS.has(chainId)) {
        return NextResponse.json({ error: "Réseau non pris en charge par l’intégration LI.FI." }, { status: 400 });
      }
      url = new URL(`${LIFI_API}/tokens`);
      url.searchParams.set("chains", chainId);
    } else if (resource === "token") {
      const chainId = params.get("chainId") ?? "";
      const address = params.get("address") ?? "";
      if (!ALLOWED_CHAINS.has(chainId) || Number(chainId) === LIFI_SOLANA_CHAIN_ID || !validAddress(chainId, address)) {
        return NextResponse.json({ error: "Adresse de token invalide pour ce réseau." }, { status: 400 });
      }
      url = new URL(`${LIFI_API}/token`);
      url.searchParams.set("chain", chainId);
      url.searchParams.set("token", address);
    } else if (resource === "status") {
      const txHash = params.get("txHash") ?? "";
      if (!fromChain || !toChain || !ALLOWED_CHAINS.has(fromChain) || !ALLOWED_CHAINS.has(toChain) || !/^0x[\da-fA-F]{64}$/.test(txHash)) {
        return NextResponse.json({ error: "Paramètres de suivi invalides." }, { status: 400 });
      }
      url = new URL(`${LIFI_API}/status`);
      url.searchParams.set("txHash", txHash);
      url.searchParams.set("fromChain", fromChain);
      url.searchParams.set("toChain", toChain);
    } else if (resource === "quote") {
      const fromToken = params.get("fromToken") ?? "";
      const toToken = params.get("toToken") ?? "";
      const fromAmount = params.get("fromAmount") ?? "";
      const fromAddress = params.get("fromAddress") ?? "";
      const slippage = Number(params.get("slippage") ?? "0.005");
      const toAddress = params.get("toAddress") ?? "";
      const rawFromDecimals = params.get("fromDecimals");
      const rawToDecimals = params.get("toDecimals");
      const fromDecimals = Number(rawFromDecimals);
      const toDecimals = Number(rawToDecimals);
      if (
        !fromChain || !toChain || !ALLOWED_CHAINS.has(fromChain) || !ALLOWED_CHAINS.has(toChain) ||
        !validAddress(fromChain, fromToken) || !validAddress(toChain, toToken) ||
        !/^\d+$/.test(fromAmount) || BigInt(fromAmount) <= BigInt(0) ||
        !validAddress(fromChain, fromAddress) || !validAddress(toChain, toAddress) ||
        rawFromDecimals === null || !Number.isInteger(fromDecimals) || fromDecimals < 0 || fromDecimals > 255 ||
        rawToDecimals === null || !Number.isInteger(toDecimals) || toDecimals < 0 || toDecimals > 255 ||
        !Number.isFinite(slippage) || slippage < 0 || slippage > 0.05
      ) {
        return NextResponse.json({
          error: "Paramètres de cotation invalides.",
          diagnostic: {
            type: "invalid_request",
            chainIds: { from: fromChain, to: toChain },
            addressFormatsValid: {
              fromToken: Boolean(fromChain && validAddress(fromChain, fromToken)),
              toToken: Boolean(toChain && validAddress(toChain, toToken)),
              fromAddress: Boolean(fromChain && validAddress(fromChain, fromAddress)),
              toAddress: Boolean(toChain && validAddress(toChain, toAddress)),
            },
            rawAmount: fromAmount,
            decimals: { from: params.get("fromDecimals"), to: params.get("toDecimals") },
          },
        }, { status: 400 });
      }
      url = new URL(`${LIFI_API}/quote`);
      url.searchParams.set("fromChain", fromChain);
      url.searchParams.set("toChain", toChain);
      url.searchParams.set("fromToken", fromToken);
      url.searchParams.set("toToken", toToken);
      url.searchParams.set("fromAmount", fromAmount);
      url.searchParams.set("fromAddress", fromAddress);
      url.searchParams.set("toAddress", toAddress);
      url.searchParams.set("slippage", String(slippage));
      url.searchParams.set("order", "CHEAPEST");
      if (usesEvmFee) {
        url.searchParams.set("integrator", ZINGSWAP_INTEGRATOR);
        url.searchParams.set("fee", ZINGSWAP_FEE);
      }
    } else {
      return NextResponse.json({ error: "Ressource inconnue." }, { status: 400 });
    }

    const response = await fetch(url, {
      headers: headers(),
      cache: "no-store",
      signal: controller.signal,
    });
    const responseText = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(responseText) as unknown;
    } catch {
      payload = { message: "LI.FI a renvoyé un corps non JSON." };
    }
    if (resource === "quote" && response.ok) {
      const quote = payload as {
        estimate?: {
          toAmount?: unknown;
          toAmountMin?: unknown;
          feeCosts?: Array<Record<string, unknown>>;
          gasCosts?: Array<Record<string, unknown>>;
          executionDuration?: unknown;
        };
        action?: Record<string, unknown>;
        includedSteps?: unknown[];
      };
      const action = quote.action as { fromToken?: { decimals?: unknown }; toToken?: { decimals?: unknown } } | undefined;
      const requestedFromDecimals = Number(params.get("fromDecimals"));
      const requestedToDecimals = Number(params.get("toDecimals"));
      if (
        (typeof action?.fromToken?.decimals === "number" && action.fromToken.decimals !== requestedFromDecimals) ||
        (typeof action?.toToken?.decimals === "number" && action.toToken.decimals !== requestedToDecimals)
      ) {
        return NextResponse.json({
          error: "Les décimales LI.FI ne correspondent pas aux métadonnées utilisées pour convertir le montant.",
          diagnostic: {
            type: "token_decimals_mismatch",
            upstreamStatus: response.status,
            chainIds: { from: fromChain, to: toChain },
            requestedDecimals: { from: requestedFromDecimals, to: requestedToDecimals },
            upstreamDecimals: { from: action?.fromToken?.decimals, to: action?.toToken?.decimals },
          },
        }, { status: 502 });
      }
      if (!quote.estimate || typeof quote.estimate.toAmount !== "string" || !/^\d+$/.test(quote.estimate.toAmount)) {
        return NextResponse.json({
          error: "Réponse LI.FI invalide : aucun montant de sortie exploitable.",
          diagnostic: {
            type: "invalid_upstream_response",
            upstreamStatus: response.status,
            chainIds: { from: fromChain, to: toChain },
          },
        }, { status: 502 });
      }
      const feeConfirmed = usesEvmFee && confirmsIntegratorFee(payload);
      return NextResponse.json({
        ...(payload as Record<string, unknown>),
        zingswapFee: usesEvmFee ? { requested: ZINGSWAP_FEE, confirmed: feeConfirmed } : undefined,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    if (resource === "status" && response.ok) {
      const status = payload as { status?: unknown; substatus?: unknown; receiving?: { txHash?: unknown } };
      return NextResponse.json({
        status: status.status,
        substatus: status.substatus,
        receivingTxHash: typeof status.receiving?.txHash === "string" ? status.receiving.txHash : undefined,
      }, { headers: { "Cache-Control": "no-store" } });
    }
    if (resource === "status" && !response.ok) {
      return NextResponse.json({ error: "Le suivi de transaction LI.FI est momentanément indisponible." }, {
        status: response.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    if (resource === "quote" && !response.ok) {
      const classification = classifyUpstreamError(response.status, payload);
      return NextResponse.json({
        error: classification.label,
        diagnostic: {
          type: classification.type,
          upstreamStatus: response.status,
          upstreamCode: classification.code,
          upstreamMessage: sanitizeUpstreamMessage(
            payload && typeof payload === "object" ? (payload as Record<string, unknown>).message : undefined,
          ),
          upstreamFields: payload && typeof payload === "object" ? Object.keys(payload as Record<string, unknown>) : [],
          upstreamErrorCount: payload && typeof payload === "object" && Array.isArray((payload as Record<string, unknown>).errors)
            ? ((payload as Record<string, unknown>).errors as unknown[]).length
            : undefined,
          chainIds: { from: fromChain, to: toChain },
          tokens: { from: params.get("fromToken"), to: params.get("toToken") },
          rawAmount: params.get("fromAmount"),
          decimals: { from: params.get("fromDecimals"), to: params.get("toDecimals") },
          addressFormatsValid: {
            fromAddress: Boolean(fromChain && validAddress(fromChain, params.get("fromAddress") ?? "")),
            toAddress: Boolean(toChain && validAddress(toChain, params.get("toAddress") ?? "")),
          },
        },
      }, {
        status: response.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
    return NextResponse.json(payload, { status: response.status, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    return NextResponse.json(
      { error: timedOut ? "La requête LI.FI a expiré." : "LI.FI est momentanément indisponible." },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
