import { NextResponse } from "next/server";

const JUPITER_EXECUTE_URL = "https://api.jup.ag/swap/v2/execute";

interface JupiterExecuteResult {
  status?: "Success" | "Failed";
  signature?: string;
  code?: number;
  error?: string;
  totalInputAmount?: string;
  totalOutputAmount?: string;
  inputAmountResult?: string;
  outputAmountResult?: string;
}

export async function POST(request: Request) {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "La route externe est indisponible : configuration serveur manquante." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const { signedTransaction, requestId, lastValidBlockHeight } = body;

    if (
      typeof signedTransaction !== "string" ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(signedTransaction) ||
      typeof requestId !== "string" ||
      requestId.length < 1 ||
      requestId.length > 200 ||
      (lastValidBlockHeight != null &&
        (typeof lastValidBlockHeight !== "string" || !/^\d+$/.test(lastValidBlockHeight)))
    ) {
      return NextResponse.json(
        { error: "Paramètres d'exécution de la route externe invalides." },
        { status: 400 }
      );
    }

    const response = await fetch(JUPITER_EXECUTE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        signedTransaction,
        requestId,
        ...(lastValidBlockHeight ? { lastValidBlockHeight } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
    const result = (await response.json()) as JupiterExecuteResult;

    if (!response.ok) {
      return NextResponse.json(
        { error: `La route externe a répondu HTTP ${response.status}.` },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        status: result.status ?? "Failed",
        signature: result.signature ?? null,
        code: typeof result.code === "number" ? result.code : null,
        error: result.error ? "Échec de l'exécution via la route externe." : null,
        totalInputAmount: result.totalInputAmount ?? null,
        totalOutputAmount: result.totalOutputAmount ?? null,
        inputAmountResult: result.inputAmountResult ?? null,
        outputAmountResult: result.outputAmountResult ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { error: "L'exécution via la route externe a échoué ou a expiré." },
      { status: 502 }
    );
  }
}
