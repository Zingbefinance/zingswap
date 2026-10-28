import { NextResponse } from "next/server";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";
import { PLATFORM_FEE_BPS, TREASURY_WALLET } from "../../../config/fees";
import { RPC_ENDPOINT } from "../../../config/network";

export const maxDuration = 20;

const JUPITER_BUILD_URL = "https://api.jup.ag/swap/v2/build";
const PUBLIC_KEY_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

interface JupiterBuildResponse {
  inputMint?: string;
  outputMint?: string;
  inAmount?: string;
  outAmount?: string;
  otherAmountThreshold?: string;
  slippageBps?: number;
  routePlan?: Array<{
    percent?: number;
    bps?: number;
    swapInfo?: { label?: string };
  }>;
  computeBudgetInstructions?: ApiInstruction[];
  setupInstructions?: ApiInstruction[];
  swapInstruction?: ApiInstruction;
  cleanupInstruction?: ApiInstruction | null;
  otherInstructions?: ApiInstruction[];
  tipInstruction?: ApiInstruction | null;
  addressesByLookupTableAddress?: Record<string, string[]> | null;
  blockhashWithMetadata?: { blockhash?: number[]; lastValidBlockHeight?: number };
  errorCode?: number;
  errorMessage?: string;
  error?: string;
}

interface ApiInstruction {
  programId: string;
  accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string;
}

function safeUpstreamMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const message = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/(x-api-key|api[_-]?key|authorization|bearer)\s*[:=]\s*[^\s,;]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
  return message || undefined;
}

async function verifyTreasuryFeeAccount(feeMint: string) {
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const mint = new PublicKey(feeMint);
  const treasury = new PublicKey(TREASURY_WALLET);
  const mintInfo = await connection.getAccountInfo(mint, "confirmed");
  if (!mintInfo) return { ok: false as const, reason: "output_mint_not_found" };

  const tokenProgram = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID].find((program) =>
    program.equals(mintInfo.owner)
  );
  if (!tokenProgram) return { ok: false as const, reason: "unsupported_token_program" };

  const feeAccount = getAssociatedTokenAddressSync(mint, treasury, true, tokenProgram);
  try {
    const account = await getAccount(connection, feeAccount, "confirmed", tokenProgram);
    if (!account.isInitialized || account.isFrozen ||
      !account.owner.equals(treasury) || !account.mint.equals(mint)) {
      return { ok: false as const, reason: "treasury_fee_account_invalid" };
    }
    return { ok: true as const, feeAccount: feeAccount.toBase58(), tokenProgram: tokenProgram.toBase58() };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const name = error instanceof Error ? error.name.toLowerCase() : "";
    if (name === "tokenaccountnotfounderror" || message.includes("account does not exist") || message.includes("could not find account")) {
      return { ok: false as const, reason: "treasury_fee_account_not_initialized", feeAccount: feeAccount.toBase58() };
    }
    return { ok: false as const, reason: "rpc_unavailable" };
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.JUPITER_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "Configuration du service de swap manquante côté serveur." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = await request.json();
    const { inputMint, outputMint, amount, taker, slippageBps } = body;
    if (
      typeof inputMint !== "string" || !PUBLIC_KEY_PATTERN.test(inputMint) ||
      typeof outputMint !== "string" || !PUBLIC_KEY_PATTERN.test(outputMint) || inputMint === outputMint ||
      typeof amount !== "string" || !/^\d+$/.test(amount) || BigInt(amount) <= BigInt(0) ||
      typeof taker !== "string" || !PUBLIC_KEY_PATTERN.test(taker) ||
      ![10, 50, 100, 300].includes(slippageBps)
    ) {
      return NextResponse.json(
        { error: "Paramètres de prévisualisation du swap invalides." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!Number.isInteger(PLATFORM_FEE_BPS) || PLATFORM_FEE_BPS <= 0 || PLATFORM_FEE_BPS > 10_000) {
      return NextResponse.json(
        { error: "Configuration du taux de frais plateforme invalide." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    // Platform fees are collected in WSOL. Jupiter requires the fee mint to
    // participate in the swap; native SOL is represented by its WSOL mint.
    if (inputMint !== WRAPPED_SOL_MINT && outputMint !== WRAPPED_SOL_MINT) {
      return NextResponse.json(
        { error: "La collecte des frais en SOL (WSOL) nécessite SOL/WSOL comme token d’entrée ou de sortie." },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }

    // The treasury WSOL ATA must already exist; this route never creates it.
    const treasuryFeeAccount = await verifyTreasuryFeeAccount(WRAPPED_SOL_MINT);
    if (!treasuryFeeAccount.ok) {
      return NextResponse.json(
        {
          error: "Prévisualisation bloquée : le compte de collecte ZingSwap en WSOL n’est pas vérifié.",
          feeAccountStatus: treasuryFeeAccount.reason,
          ...(treasuryFeeAccount.feeAccount ? { feeAccount: treasuryFeeAccount.feeAccount } : {}),
        },
        { status: treasuryFeeAccount.reason === "rpc_unavailable" ? 503 : 409, headers: { "Cache-Control": "no-store" } }
      );
    }

    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount,
      taker,
      slippageBps: String(slippageBps),
      platformFeeBps: String(PLATFORM_FEE_BPS),
      feeAccount: treasuryFeeAccount.feeAccount,
    });
    const response = await fetch(`${JUPITER_BUILD_URL}?${params}`, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15_000)]),
    });

    let build: JupiterBuildResponse;
    try {
      build = await response.json() as JupiterBuildResponse;
    } catch {
      return NextResponse.json(
        { error: "Le service de swap a renvoyé une réponse de construction illisible." },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!response.ok || !build.swapInstruction || !build.blockhashWithMetadata) {
      return NextResponse.json(
        {
          error: "Le service de swap n’a pas fourni les instructions nécessaires à la prévisualisation.",
          upstreamStatus: response.status,
          ...(typeof build.errorCode === "number" ? { upstreamErrorCode: build.errorCode } : {}),
          ...(safeUpstreamMessage(build.errorMessage ?? build.error) ? { upstreamMessage: safeUpstreamMessage(build.errorMessage ?? build.error) } : {}),
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const feeAccountIncluded = build.swapInstruction.accounts.some(
      (account) => account.pubkey === treasuryFeeAccount.feeAccount
    );
    if (
      build.inputMint !== inputMint ||
      build.outputMint !== outputMint ||
      build.inAmount !== amount ||
      !feeAccountIncluded
    ) {
      return NextResponse.json(
        {
          error: "Prévisualisation refusée : la réponse construite ne confirme pas les paramètres et le compte de frais attendus.",
          feeEvidence: {
            requestedBps: PLATFORM_FEE_BPS,
            feeAccountIncludedInSwapInstruction: feeAccountIncluded,
            inputMintMatched: build.inputMint === inputMint,
            outputMintMatched: build.outputMint === outputMint,
            amountMatched: build.inAmount === amount,
          },
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        previewOnly: true,
        signed: false,
        submitted: false,
        platformFeeBps: PLATFORM_FEE_BPS,
        feeMint: WRAPPED_SOL_MINT,
        feeAccount: treasuryFeeAccount.feeAccount,
        feeAccountIncludedInSwapInstruction: feeAccountIncluded,
        tokenProgram: treasuryFeeAccount.tokenProgram,
        inputMint: build.inputMint ?? inputMint,
        outputMint: build.outputMint ?? outputMint,
        inAmount: build.inAmount ?? amount,
        outAmount: build.outAmount ?? null,
        otherAmountThreshold: build.otherAmountThreshold ?? null,
        routePlan: build.routePlan ?? [],
        computeBudgetInstructions: build.computeBudgetInstructions ?? [],
        setupInstructions: build.setupInstructions ?? [],
        swapInstruction: build.swapInstruction,
        cleanupInstruction: build.cleanupInstruction ?? null,
        otherInstructions: build.otherInstructions ?? [],
        tipInstruction: build.tipInstruction ?? null,
        addressesByLookupTableAddress: build.addressesByLookupTableAddress ?? null,
        blockhashWithMetadata: build.blockhashWithMetadata,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return NextResponse.json(
        { error: "La prévisualisation de la route externe a expiré." },
        { status: 504, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.json(
      { error: "Impossible de préparer la prévisualisation du swap." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
