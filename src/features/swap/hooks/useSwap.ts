"use client";

import { useCallback, useMemo } from "react";
import {
  BN,
  type Wallet,
} from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createSyncNativeInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID as SPL_TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AddressLookupTableAccount,
  ComputeBudgetProgram,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";

import {
  createZingSwapProgram,
  getPoolPda,
  getVaultPdas,
  ZINGSWAP_PROGRAM_ID,
  ZTC_MINT,
  WSOL_MINT,
} from "../../../lib/anchor/zingswap";

import { getTokenByMint } from "../../../../lib/tokens/tokenRegistry";
import { useSettings } from "../../../components/providers/SettingsContext";
const ZINGSWAP_TREASURY = new PublicKey(
  "3rK2JZQ2E4QX5xHvzvRbvGMzaHXUmqECvuuzbuawSjHq"
);

interface SwapParams {
  amount: string;
  fromMint: PublicKey;
  toMint: PublicKey;
  minAmountOut?: string;
  minAmountOutRaw?: string;
}

interface SwapResult {
  signature: string;
}
interface QuoteResult {
  inputMint: string;
  outputMint: string;
  amountIn: string;
  amountOut: string;
  amountInRaw: string;
  amountOutRaw: string;
  feeRaw: string;
  feeBps: number;
  reserveInRaw: string;
  reserveOutRaw: string;
  inputDecimals: number;
  outputDecimals: number;
  minAmountOutRaw: string;
}

export interface JupiterQuoteResult {
  amountIn: string;
  amountOut: string;
  amountInRaw: string;
  amountOutRaw: string;
  inputMint: string;
  outputMint: string;
  inputDecimals: number;
  outputDecimals: number;
  router: string | null;
  route: string[];
  feeBps: number | null;
  feeAmountRaw: string | null;
  feeAmount: string | null;
  feeMint: string | null;
  feeAccount: string | null;
  feeAccountIncludedInSwapInstruction: boolean;
  platformFeeBps: number | null;
  referralFeeBpsRequested: number | null;
  referralAccountMatched: boolean;
  poolFees: null;
  priceImpact: number | null;
  signatureFeeLamports: number | null;
  prioritizationFeeLamports: number | null;
  rentFeeLamports: number | null;
}

interface JupiterBuildPreview {
  previewOnly: true;
  signed: false;
  submitted: false;
  platformFeeBps: number;
  feeMint: string;
  feeAccount: string;
  feeAccountIncludedInSwapInstruction: true;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string | null;
  routePlan: Array<{ swapInfo?: { label?: string } }>;
  computeBudgetInstructions: JupiterBuildInstruction[];
  setupInstructions: JupiterBuildInstruction[];
  swapInstruction: JupiterBuildInstruction;
  cleanupInstruction: JupiterBuildInstruction | null;
  otherInstructions: JupiterBuildInstruction[];
  tipInstruction: JupiterBuildInstruction | null;
  addressesByLookupTableAddress: Record<string, string[]> | null;
  blockhashWithMetadata: { blockhash: number[]; lastValidBlockHeight: number };
}

interface JupiterBuildInstruction {
  programId: string;
  accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  data: string;
}

interface JupiterOrderResult {
  transaction: string | null;
  requestId: string | null;
  inAmount: string | null;
  outAmount: string | null;
  router: string | null;
  lastValidBlockHeight: string | null;
  expireAt: string | null;
  errorCode: number | null;
  errorMessage: string | null;
  treasuryFee: {
    requestedBps: number;
    presentInOrder: boolean;
    referralAccountMatched: boolean;
    referralDestinationVerified: boolean;
    referralTokenAccountStatus: "verified" | "missing" | "invalid" | "rpc_unavailable";
    totalFeeBps: number | null;
    totalFeeBpsConfirmed: boolean;
    feeMintPresent: boolean;
    platformFeeAmountPresent: boolean;
    platformFeeAmountPositive: boolean;
    platformFeeBps: number | null;
    platformFeeBpsPresent: boolean;
    platformFeeFallbackDetected: boolean;
    feeMint: string | null;
  };
}

interface JupiterExecuteResult {
  status: "Success" | "Failed";
  signature: string | null;
  code: number | null;
  error: string | null;
  totalInputAmount: string | null;
  totalOutputAmount: string | null;
  inputAmountResult: string | null;
  outputAmountResult: string | null;
}
function toRawAmount(
  amount: string,
  decimals: number,
  allowZero = false
): bigint {
  const normalized = amount.trim();

  if (!normalized || (!allowZero && Number(normalized) <= 0)) {
    throw new Error(
      "Le montant du swap doit être supérieur à zéro."
    );
  }

  if (allowZero && Number(normalized) < 0) {
    throw new Error(
      "Le montant ne peut pas être négatif."
    );
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Montant invalide.");
  }

  const [whole, fraction = ""] =
    normalized.split(".");

  if (fraction.length > decimals) {
    throw new Error(
      `Le montant ne peut pas avoir plus de ${decimals} décimales.`
    );
  }

  const paddedFraction =
    fraction.padEnd(decimals, "0");

  return BigInt(`${whole}${paddedFraction}`);
}

function formatRawAmount(rawAmount: bigint, decimals: number): string {
  const raw = rawAmount.toString().padStart(decimals + 1, "0");
  if (decimals === 0) return raw;
  const whole = raw.slice(0, -decimals);
  const fraction = raw.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function useSwap() {
  const { connection } = useConnection();
  const { slippageBps } = useSettings();

  const {
    publicKey,
    connected,
    signTransaction,
    signAllTransactions,
  } = useWallet();

  const wallet = useMemo<Wallet | null>(() => {
    if (
      !publicKey ||
      !signTransaction ||
      !signAllTransactions
    ) {
      return null;
    }

    return {
      publicKey,
      signTransaction,
      signAllTransactions,
    } as Wallet;
  }, [
    publicKey,
    signTransaction,
    signAllTransactions,
  ]);

  const program = useMemo(() => {
    if (!wallet) {
      return null;
    }

    return createZingSwapProgram(
      connection,
      wallet
    );
  }, [
    connection,
    wallet,
  ]);
  const getQuote = useCallback(
    async ({
      amount,
      fromMint,
      toMint,
      slippageBps,
    }: {
      amount: string;
      fromMint: PublicKey;
      toMint: PublicKey;
      slippageBps: number;
    }): Promise<QuoteResult> => {
const [inputToken, outputToken] = await Promise.all([
  getTokenByMint(fromMint.toBase58()),
  getTokenByMint(toMint.toBase58()),
]);

if (!inputToken || !outputToken) {
  throw new Error(
    "Impossible de récupérer les informations des tokens."
  );
}

const inputDecimals = inputToken.decimals;
const outputDecimals = outputToken.decimals;

const amountInRaw = toRawAmount(
  amount,
  inputDecimals
);

let poolPda = getPoolPda(
  ZINGSWAP_PROGRAM_ID,
  fromMint,
  toMint
);

let poolAccountInfo =
  await connection.getAccountInfo(poolPda);

let aToB = true;

if (!poolAccountInfo) {
  poolPda = getPoolPda(
    ZINGSWAP_PROGRAM_ID,
    toMint,
    fromMint
  );

  poolAccountInfo =
    await connection.getAccountInfo(poolPda);

  aToB = false;
}

if (!poolAccountInfo) {
  throw new Error(
    "Aucun pool ZingSwap trouvé pour cette paire."
  );
}

const { vaultA, vaultB } =
  getVaultPdas(
    ZINGSWAP_PROGRAM_ID,
    poolPda
  );

const inputVault = aToB
  ? vaultA
  : vaultB;

const outputVault = aToB
  ? vaultB
  : vaultA;

      const [inputAccount, outputAccount] = await Promise.all([
        getAccount(connection, inputVault),
        getAccount(connection, outputVault),
      ]);

      const poolInfo = poolAccountInfo;

      if (!poolInfo) {
        throw new Error(
          "Pool ZingSwap introuvable."
        );
      }

      /*
       * Structure Pool :
       *
       * 8 bytes  : discriminator
       * 32       : authority
       * 32       : token_a_mint
       * 32       : token_b_mint
       * 32       : vault_a
       * 32       : vault_b
       * 2        : fee_bps
       */
      const feeOffset =
        8 + 32 + 32 + 32 + 32 + 32;

      const feeBps =
        poolInfo.data.readUInt16LE(
          feeOffset
        );

      if (feeBps > 10_000) {
        throw new Error(
          "Les frais du pool sont invalides."
        );
      }

      const reserveIn =
        inputAccount.amount;

      const reserveOut =
        outputAccount.amount;

      if (
  reserveIn === BigInt(0) ||
  reserveOut === BigInt(0)
) {
        throw new Error(
          "La liquidité du pool est insuffisante."
        );
      }

      /*
       * Même formule que programs/.../instructions/swap.rs
       *
       * fee =
       *   amount_in * fee_bps / 10_000
       *
       * amount_after_fee =
       *   amount_in - fee
       *
       * amount_out =
       *   amount_after_fee * reserve_out
       *   --------------------------------
       *   reserve_in + amount_after_fee
       */

      const fee =
        (amountInRaw *
  BigInt(feeBps)) /
BigInt(10_000);

      const amountInAfterFee =
        amountInRaw - fee;

      if (amountInAfterFee <= BigInt(0)) {
        throw new Error(
          "Le montant est trop petit après les frais."
        );
      }

      const numerator =
        amountInAfterFee *
        reserveOut;

      const denominator =
        reserveIn +
        amountInAfterFee;

      if (denominator <= BigInt(0)) {
        throw new Error(
          "Erreur de calcul du quote."
        );
      }

      const amountOutRaw =
  numerator / denominator;


if (amountOutRaw <= BigInt(0)) {
  throw new Error(
    "Le montant de sortie est trop petit."
  );
}

return {
  inputMint: fromMint.toBase58(),
  outputMint: toMint.toBase58(),
  amountIn: amount,
  amountOut: formatRawAmount(amountOutRaw, outputDecimals),
  amountInRaw:
    amountInRaw.toString(),
  amountOutRaw:
    amountOutRaw.toString(),
  minAmountOutRaw: ((amountOutRaw * BigInt(10_000 - slippageBps)) / BigInt(10_000)).toString(),
  feeRaw:
    fee.toString(),
  feeBps,
  reserveInRaw: reserveIn.toString(),
  reserveOutRaw: reserveOut.toString(),
  inputDecimals,
  outputDecimals,
};
    },
    [connection]
  );

  const requestJupiterBuild = useCallback(
    async ({
      inputMint,
      outputMint,
      amount,
      slippageBps: requestedSlippageBps,
      signal,
    }: {
      inputMint: string;
      outputMint: string;
      amount: string;
      slippageBps: number;
      signal?: AbortSignal;
    }): Promise<JupiterBuildPreview> => {
      if (!publicKey) {
        throw new Error("Connecte un wallet pour prévisualiser la route externe.");
      }

      const response = await fetch("/api/jupiter/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMint,
          outputMint,
          amount,
          taker: publicKey.toBase58(),
          slippageBps: requestedSlippageBps,
        }),
        cache: "no-store",
        signal,
      });
      const result = await response.json() as JupiterBuildPreview & { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "La prévisualisation de la route externe est indisponible.");
      }
      if (
        result.previewOnly !== true || result.signed !== false || result.submitted !== false ||
        result.inputMint !== inputMint || result.outputMint !== outputMint ||
        result.inAmount !== amount || !/^\d+$/.test(result.outAmount) ||
        !Number.isFinite(result.platformFeeBps) || result.platformFeeBps <= 0 ||
        !result.feeAccount || result.feeMint !== WSOL_MINT.toBase58() ||
        result.feeAccountIncludedInSwapInstruction !== true
      ) {
        throw new Error("Prévisualisation refusée : les paramètres ou la destination des frais ne sont pas confirmés.");
      }
      return result;
    },
    [publicKey]
  );

  const getJupiterQuote = useCallback(
    async ({
      amount,
      fromMint,
      toMint,
      inputDecimals,
      outputDecimals,
      slippageBps,
      signal,
    }: {
      amount: string;
      fromMint: PublicKey;
      toMint: PublicKey;
      inputDecimals: number;
      outputDecimals: number;
      slippageBps: number;
      signal?: AbortSignal;
    }): Promise<JupiterQuoteResult> => {
      const amountInRaw = toRawAmount(amount, inputDecimals).toString();
      const build = await requestJupiterBuild({
        inputMint: fromMint.toBase58(),
        outputMint: toMint.toBase58(),
        amount: amountInRaw,
        slippageBps,
        signal,
      });
      return {
        amountIn: formatRawAmount(BigInt(build.inAmount), inputDecimals),
        amountOut: formatRawAmount(BigInt(build.outAmount), outputDecimals),
        amountInRaw: build.inAmount,
        amountOutRaw: build.outAmount,
        inputMint: build.inputMint,
        outputMint: build.outputMint,
        inputDecimals,
        outputDecimals,
        router: "Route externe",
        route: [],
        feeBps: null,
        feeAmountRaw: null,
        feeAmount: null,
        feeMint: build.feeMint,
        feeAccount: build.feeAccount,
        feeAccountIncludedInSwapInstruction: build.feeAccountIncludedInSwapInstruction,
        platformFeeBps: build.platformFeeBps,
        referralFeeBpsRequested: null,
        referralAccountMatched: false,
        poolFees: null,
        priceImpact: null,
        signatureFeeLamports: null,
        prioritizationFeeLamports: null,
        rentFeeLamports: null,
      };
    },
    [requestJupiterBuild]
  );

  const previewJupiterBuild = useCallback(
    async ({
      amount,
      fromMint,
      toMint,
      slippageBps: requestedSlippageBps,
    }: {
      amount: string;
      fromMint: PublicKey;
      toMint: PublicKey;
      slippageBps: number;
    }): Promise<JupiterBuildPreview> => {
      const inputToken = await getTokenByMint(fromMint.toBase58());
      if (!inputToken) throw new Error("Métadonnées du token d’entrée indisponibles.");
      const amountRaw = toRawAmount(amount, inputToken.decimals).toString();
      return requestJupiterBuild({
        inputMint: fromMint.toBase58(),
        outputMint: toMint.toBase58(),
        amount: amountRaw,
        slippageBps: requestedSlippageBps,
      });
    },
    [requestJupiterBuild]
  );

  const swapJupiterBuild = useCallback(
    async ({
      amount,
      fromMint,
      toMint,
      slippageBps: requestedSlippageBps,
      onReadyToSign,
    }: {
      amount: string;
      fromMint: PublicKey;
      toMint: PublicKey;
      slippageBps: number;
      onReadyToSign?: (build: JupiterBuildPreview) => void;
    }): Promise<{ signature: string; amountOut: string; feeAccount: string; platformFeeBps: number }> => {
      if (!connected || !publicKey || !signTransaction) {
        throw new Error("Connecte un portefeuille capable de signer les transactions.");
      }

      const inputToken = await getTokenByMint(fromMint.toBase58());
      if (!inputToken) throw new Error("Métadonnées du token d’entrée indisponibles.");
      const amountRaw = toRawAmount(amount, inputToken.decimals).toString();
      const build = await requestJupiterBuild({
        inputMint: fromMint.toBase58(),
        outputMint: toMint.toBase58(),
        amount: amountRaw,
        slippageBps: requestedSlippageBps,
      });
      const toInstruction = (ix: JupiterBuildInstruction) => new TransactionInstruction({
        programId: new PublicKey(ix.programId),
        keys: ix.accounts.map((account) => ({
          pubkey: new PublicKey(account.pubkey),
          isSigner: account.isSigner,
          isWritable: account.isWritable,
        })),
        data: Buffer.from(ix.data, "base64"),
      });

      const lastValidBlockHeight = build.blockhashWithMetadata.lastValidBlockHeight;
      const blockhashBytes = build.blockhashWithMetadata.blockhash;
      if (
        !Array.isArray(blockhashBytes) || blockhashBytes.length !== 32 ||
        blockhashBytes.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255) ||
        !Number.isSafeInteger(lastValidBlockHeight) || lastValidBlockHeight <= 0
      ) {
        throw new Error("La route externe a retourné un blockhash ou une expiration invalide.");
      }
      const recentBlockhash = new PublicKey(Uint8Array.from(blockhashBytes)).toBase58();
      const currentBlockHeight = await connection.getBlockHeight("confirmed");
      if (currentBlockHeight > lastValidBlockHeight) {
        throw new Error("Le blockhash de la route externe a expiré. Demande une nouvelle cotation.");
      }

      const lookupTables = Object.entries(build.addressesByLookupTableAddress ?? {}).map(
        ([key, addresses]) => new AddressLookupTableAccount({
          key: new PublicKey(key),
          state: {
            deactivationSlot: BigInt("18446744073709551615"),
            lastExtendedSlot: 0,
            lastExtendedSlotStartIndex: 0,
            addresses: addresses.map((address) => new PublicKey(address)),
          },
        })
      );
      const swapInstructions = [
        ...build.setupInstructions.map(toInstruction),
        toInstruction(build.swapInstruction),
        ...(build.cleanupInstruction ? [toInstruction(build.cleanupInstruction)] : []),
        ...build.otherInstructions.map(toInstruction),
        ...(build.tipInstruction ? [toInstruction(build.tipInstruction)] : []),
      ];
      const feeAccount = new PublicKey(build.feeAccount);
      if (!swapInstructions.some((instruction) =>
        instruction.keys.some((account) => account.pubkey.equals(feeAccount))
      )) {
        throw new Error("Refus avant signature : l’ATA WSOL de la trésorerie manque dans les instructions.");
      }

      const compileTransaction = (instructions: TransactionInstruction[]) => new VersionedTransaction(
        new TransactionMessage({
          payerKey: publicKey,
          recentBlockhash,
          instructions,
        }).compileToV0Message(lookupTables)
      );
      const maxComputeUnits = 1_400_000;
      const simulationTx = compileTransaction([
        ComputeBudgetProgram.setComputeUnitLimit({ units: maxComputeUnits }),
        ...build.computeBudgetInstructions.map(toInstruction),
        ...swapInstructions,
      ]);
      const simulation = await connection.simulateTransaction(simulationTx, {
        commitment: "confirmed",
        replaceRecentBlockhash: true,
        sigVerify: false,
      });
      if (simulation.value.err) {
        throw new Error("Simulation refusée avant signature. Vérifie le solde, la route et les comptes requis.");
      }
      if (simulation.value.unitsConsumed == null || simulation.value.unitsConsumed > maxComputeUnits) {
        throw new Error("La simulation n’a pas fourni une consommation de calcul valide.");
      }

      const computeUnitLimit = Math.min(
        Math.ceil(simulation.value.unitsConsumed * 1.2),
        maxComputeUnits
      );
      const transaction = compileTransaction([
        ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit }),
        ...build.computeBudgetInstructions.map(toInstruction),
        ...swapInstructions,
      ]);
      const requiredSignerCount = transaction.message.header.numRequiredSignatures;
      const takerSignerIndex = transaction.message.staticAccountKeys
        .slice(0, requiredSignerCount)
        .findIndex((key) => key.equals(publicKey));
      if (takerSignerIndex < 0) {
        throw new Error("Refus avant signature : la transaction ne requiert pas la signature du wallet connecté.");
      }

      onReadyToSign?.(build);
      const signedTransaction = await signTransaction(transaction);
      if (!Buffer.from(signedTransaction.message.serialize()).equals(Buffer.from(transaction.message.serialize()))) {
        throw new Error("Le wallet a modifié le contenu de la transaction ; envoi bloqué.");
      }
      if (!signedTransaction.signatures[takerSignerIndex]?.some((byte) => byte !== 0)) {
        throw new Error("Le wallet n’a pas signé la transaction.");
      }

      const heightBeforeSend = await connection.getBlockHeight("confirmed");
      if (heightBeforeSend > lastValidBlockHeight) {
        throw new Error("La transaction a expiré avant l’envoi. Demande une nouvelle cotation.");
      }
      const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
        maxRetries: 3,
        preflightCommitment: "confirmed",
      });
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash: recentBlockhash,
        lastValidBlockHeight,
      }, "confirmed");
      if (confirmation.value.err) {
        throw new Error(`La transaction Jupiter a échoué sur Solana (${signature}).`);
      }

      return {
        signature,
        amountOut: build.outAmount,
        feeAccount: build.feeAccount,
        platformFeeBps: build.platformFeeBps,
      };
    },
    [connected, connection, publicKey, requestJupiterBuild, signTransaction]
  );

  const swapOnJupiter = useCallback(
    async ({
      amount,
      fromMint,
      toMint,
      slippageBps,
      onOrderFeeStatus,
    }: {
      amount: string;
      fromMint: PublicKey;
      toMint: PublicKey;
      slippageBps: number;
      onOrderFeeStatus?: (fee: JupiterOrderResult["treasuryFee"]) => void;
    }): Promise<{
      signature: string;
      amountOut: string | null;
      feeAmountObservedRaw: string | null;
      feeMint: string | null;
      requestedFeeBps: number;
      feePresentInOrder: true;
      treasuryPayoutVerified: false;
    }> => {
      if (!connected || !publicKey || !signTransaction) {
        throw new Error("Connecte un portefeuille capable de signer les transactions.");
      }

      const inputToken = await getTokenByMint(fromMint.toBase58());
      if (!inputToken) {
        throw new Error("Métadonnées du token d'entrée indisponibles.");
      }
      const amountRaw = toRawAmount(amount, inputToken.decimals).toString();

      const orderResponse = await fetch("/api/jupiter/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMint: fromMint.toBase58(),
          outputMint: toMint.toBase58(),
          amount: amountRaw,
          taker: publicKey.toBase58(),
          slippageBps,
        }),
        cache: "no-store",
      });
      const order = (await orderResponse.json()) as JupiterOrderResult & { error?: string };

      if (!orderResponse.ok) {
        throw new Error(order.error || "Impossible de préparer la transaction via la route externe.");
      }
      if (
        !order.treasuryFee?.presentInOrder ||
        order.treasuryFee.requestedBps !== 50 ||
        !order.treasuryFee.totalFeeBpsConfirmed ||
        !order.treasuryFee.referralDestinationVerified ||
        order.treasuryFee.platformFeeFallbackDetected ||
        !order.treasuryFee.feeMintPresent
      ) {
        const feeChecks = order.treasuryFee;
        const reasons = [
          !feeChecks?.referralAccountMatched && "referralAccount absent ou différent du compte attendu",
          feeChecks?.requestedBps !== 50 && "la demande de frais ne correspond pas à 0,50 %",
          !feeChecks?.totalFeeBpsConfirmed && `feeBps total absent ou inférieur aux 50 pb demandés (${feeChecks?.totalFeeBps ?? "absent"} pb reçu)`,
          !feeChecks?.feeMintPresent && "feeMint absent ou invalide",
          !feeChecks?.referralDestinationVerified && `referralTokenAccount non vérifié (${feeChecks?.referralTokenAccountStatus ?? "état inconnu"})`,
          feeChecks?.platformFeeFallbackDetected && `platformFee.feeBps vaut ${feeChecks.platformFeeBps} pb : frais plateforme de repli détectés`,
          feeChecks != null && !feeChecks.presentInOrder && "les champs de frais de l’ordre ne satisfont pas le contrôle complet",
        ].filter((reason): reason is string => Boolean(reason));
        throw new Error(`Refus avant signature : ${reasons.join(" ; ")}. La route vérifie l'ATA du feeMint sur Solana, mais pas le versement effectif; aucune transaction n’a été signée ni envoyée.`);
      }
      onOrderFeeStatus?.(order.treasuryFee);

      if (order.transaction === "") {
        throw new Error(
          `La route externe n'a pas pu construire la transaction (code ${order.errorCode ?? "inconnu"}).`
        );
      }
      if (!order.transaction) {
        throw new Error("Aucune transaction à signer n'a été retournée.");
      }
      if (!order.requestId) {
        throw new Error("La demande d'exécution de la route externe est incomplète.");
      }

      const ensureOrderIsFresh = async () => {
        if (order.expireAt) {
          const expiresAt = Date.parse(order.expireAt);
          if (!Number.isFinite(expiresAt)) {
            throw new Error("La route externe a retourné une expiration de cotation invalide.");
          }
          if (expiresAt <= Date.now()) {
            throw new Error("La cotation externe a expiré. Demande une nouvelle cotation.");
          }
        }

        if (order.lastValidBlockHeight) {
          const lastValidBlockHeight = Number(order.lastValidBlockHeight);
          if (!Number.isSafeInteger(lastValidBlockHeight)) {
            throw new Error("La route externe a retourné une limite de bloc invalide.");
          }
          const currentBlockHeight = await connection.getBlockHeight("confirmed");
          if (currentBlockHeight > lastValidBlockHeight) {
            throw new Error("La transaction a expiré. Demande une nouvelle cotation.");
          }
        }
      };

      await ensureOrderIsFresh();

      let unsignedTransaction: VersionedTransaction;
      try {
        unsignedTransaction = VersionedTransaction.deserialize(
          Buffer.from(order.transaction, "base64")
        );
      } catch {
        throw new Error("La transaction retournée par la route externe est invalide.");
      }

      const requiredSignerCount =
        unsignedTransaction.message.header.numRequiredSignatures;
      const takerSignerIndex = unsignedTransaction.message.staticAccountKeys
        .slice(0, requiredSignerCount)
        .findIndex((key) => key.equals(publicKey));
      if (takerSignerIndex < 0) {
        throw new Error("La transaction ne demande pas la signature du portefeuille connecté.");
      }

      // La signature reste dans le portefeuille; seule la transaction signée sera transmise au proxy.
      const signedTransaction = await signTransaction(unsignedTransaction);
      if (!signedTransaction.signatures[takerSignerIndex]?.some((byte) => byte !== 0)) {
        throw new Error("Le portefeuille n'a pas signé la transaction.");
      }
      await ensureOrderIsFresh();

      const executeResponse = await fetch("/api/jupiter/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedTransaction: Buffer.from(signedTransaction.serialize()).toString("base64"),
          requestId: order.requestId,
          ...(order.lastValidBlockHeight
            ? { lastValidBlockHeight: order.lastValidBlockHeight }
            : {}),
        }),
        cache: "no-store",
      });
      const result = (await executeResponse.json()) as JupiterExecuteResult & { error?: string };

      if (!executeResponse.ok) {
        throw new Error("La route externe n'a pas pu exécuter la transaction signée.");
      }
      if (result.status !== "Success" || !result.signature) {
        throw new Error(
          `La route externe a échoué à exécuter le swap (code ${result.code ?? "inconnu"}).`
        );
      }

      const confirmation = await connection.confirmTransaction(result.signature, "confirmed");
      if (confirmation.value.err) {
        throw new Error("La transaction de swap a été incluse mais a échoué sur le réseau.");
      }

      const rawAmount = (value: string | null) => value && /^\d+$/.test(value) ? BigInt(value) : null;
      const totalInputAmount = rawAmount(result.totalInputAmount);
      const inputAmountResult = rawAmount(result.inputAmountResult);
      const outputAmountResult = rawAmount(result.outputAmountResult);
      const totalOutputAmount = rawAmount(result.totalOutputAmount);
      let feeAmountObserved: bigint | null = null;
      if (order.treasuryFee.feeMint === fromMint.toBase58() && totalInputAmount !== null && inputAmountResult !== null) {
        feeAmountObserved = totalInputAmount >= inputAmountResult ? totalInputAmount - inputAmountResult : null;
      } else if (order.treasuryFee.feeMint === toMint.toBase58() && outputAmountResult !== null && totalOutputAmount !== null) {
        feeAmountObserved = outputAmountResult >= totalOutputAmount ? outputAmountResult - totalOutputAmount : null;
      }

      return {
        signature: result.signature,
        amountOut: result.totalOutputAmount,
        feeAmountObservedRaw: feeAmountObserved?.toString() ?? null,
        feeMint: order.treasuryFee.feeMint,
        requestedFeeBps: order.treasuryFee.requestedBps,
        feePresentInOrder: true,
        treasuryPayoutVerified: false,
      };
    },
    [connected, publicKey, signTransaction, connection]
  );

  const swap = useCallback(
  async ({
    
    amount,
    fromMint,
    toMint,
    minAmountOut = "0",
    minAmountOutRaw,
  }: SwapParams): Promise<SwapResult> => {
      if (
        !connected ||
        !publicKey ||
        !wallet ||
        !program
      ) {
        throw new Error(
          "Wallet non connecté."
        );
      }

      if (!signTransaction) {
        throw new Error(
          "Le wallet ne permet pas de signer les transactions."
        );
      }

      const inputToken = await getTokenByMint(
  fromMint.toBase58()
);

const outputToken = await getTokenByMint(
  toMint.toBase58()
);

if (!inputToken || !outputToken) {
  throw new Error(
    "Impossible de récupérer les informations des tokens."
  );
}

const fromDecimals = inputToken.decimals;
const toDecimals = outputToken.decimals;

const amountInRaw = toRawAmount(
  amount,
  fromDecimals
);

const minAmountOutRawValue = minAmountOutRaw
  ? BigInt(minAmountOutRaw)
  : toRawAmount(
      minAmountOut,
      toDecimals,
      true
    );

// Recherche du pool dans le sens
// token d'entrée -> token de sortie.
let poolPda = getPoolPda(
  ZINGSWAP_PROGRAM_ID,
  fromMint,
  toMint
);

let poolAccountInfo =
  await connection.getAccountInfo(poolPda);

let aToB = true;

// Si le pool n'existe pas dans ce sens,
// on essaie l'ordre inverse.
if (!poolAccountInfo) {
  poolPda = getPoolPda(
    ZINGSWAP_PROGRAM_ID,
    toMint,
    fromMint
  );

  poolAccountInfo =
    await connection.getAccountInfo(poolPda);

  aToB = false;
}

if (!poolAccountInfo) {
  throw new Error(
    "Aucun pool ZingSwap trouvé pour cette paire."
  );
}

const {
  vaultA,
  vaultB,
} = getVaultPdas(
  ZINGSWAP_PROGRAM_ID,
  poolPda
);
      const ZINGSWAP_TREASURY = new PublicKey(
  "3rK2JZQ2E4QX5xHvzvRbvGMzaHXUmqECvuuzbuawSjHq"
);

      const userInput =
        getAssociatedTokenAddressSync(
          fromMint,
          publicKey,
          false,
          SPL_TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        

      const userOutput =
        getAssociatedTokenAddressSync(
          toMint,
          publicKey,
          false,
          SPL_TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        const treasuryInput =
  getAssociatedTokenAddressSync(
    fromMint,
    ZINGSWAP_TREASURY,
    false,
    SPL_TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

      

      const transaction =
        new Transaction();

      const inputAccountInfo =
        await connection.getAccountInfo(
          userInput
        );

      const outputAccountInfo =
        await connection.getAccountInfo(
          userOutput
        );
        const treasuryInputInfo =
  await connection.getAccountInfo(
    treasuryInput
  );

  /*
 * Création du compte token de trésorerie
 * s'il n'existe pas encore.
 *
 * La trésorerie reste propriétaire de l'ATA.
 * Le wallet utilisateur paie uniquement la création.
 */
if (!treasuryInputInfo) {
  transaction.add(
    createAssociatedTokenAccountIdempotentInstruction(
      publicKey,
      treasuryInput,
      ZINGSWAP_TREASURY,
      fromMint,
      SPL_TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  );
}

      /*
       * Création du compte token d'entrée
       * s'il n'existe pas encore.
       */
      if (!inputAccountInfo) {
        transaction.add(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            userInput,
            publicKey,
            fromMint,
            SPL_TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }
      

      /*
       * Création du compte token de sortie
       * s'il n'existe pas encore.
       */
      if (!outputAccountInfo) {
        transaction.add(
          createAssociatedTokenAccountIdempotentInstruction(
            publicKey,
            userOutput,
            publicKey,
            toMint,
            SPL_TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID
          )
        );
      }

      /*
       * Pour un swap SOL -> ZTC :
       *
       * 1. Le SOL est envoyé vers l'ATA WSOL.
       * 2. Le compte WSOL est synchronisé.
       * 3. Le programme ZingSwap utilise ensuite
       *    ce WSOL comme token d'entrée.
       */
      if (
  fromMint.equals(WSOL_MINT) &&
  toMint.equals(ZTC_MINT)
) {
        const lamports =
          Number(amountInRaw);

        if (
          !Number.isSafeInteger(lamports)
        ) {
          throw new Error(
            "Montant SOL trop élevé pour cette transaction."
          );
        }

        transaction.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: userInput,
            lamports,
          })
        );

        transaction.add(
          createSyncNativeInstruction(
            userInput,
            SPL_TOKEN_PROGRAM_ID
          )
        );
      }

      /*
       * ZTC = token A
       * WSOL = token B
       *
       * true  => ZTC -> WSOL
       * false => WSOL -> ZTC
       */
      const swapInstruction =
  await program.methods
    .swap(
      new BN(
        amountInRaw.toString()
      ),
      aToB,
      new BN(
        minAmountOutRawValue.toString()
      )
    )
    .accounts({
      pool: poolPda,
      userInput,
      userOutput,
      treasuryInput,
      vaultA,
      vaultB,
      user: publicKey,
      tokenProgram:
        SPL_TOKEN_PROGRAM_ID,
    })
    .instruction();

      transaction.add(
        swapInstruction
      );

        /*
 * Préparation de la transaction finale.
 *
 * IMPORTANT :
 * La transaction qui est simulée doit être
 * exactement la même que celle envoyée à Phantom.
 */
const latestBlockhash =
  await connection.getLatestBlockhash(
    "confirmed"
  );

transaction.recentBlockhash =
  latestBlockhash.blockhash;

transaction.feePayer =
  publicKey;



console.log(
  "Blockhash :",
  transaction.recentBlockhash
);

console.log(
  "Fee payer :",
  transaction.feePayer?.toBase58()
);

console.log(
  "Instructions :",
  transaction.instructions.length
);

/*
 * Simulation de la transaction EXACTE
 * qui sera envoyée à Phantom.
 */
const simulation =
  await connection.simulateTransaction(
    transaction
  );

console.log(
  "=== ZINGSWAP SIMULATION ==="
);

console.log(
  "Erreur :",
  simulation.value.err
);

console.log(
  "Logs :",
  JSON.stringify(
    simulation.value.logs,
    null,
    2
  )
);

if (simulation.value.err) {
  throw new Error(
    `Simulation ZingSwap échouée: ${JSON.stringify(
      simulation.value.err
    )}\nLogs:\n${(
      simulation.value.logs ?? []
    ).join("\n")}`
  );
}


transaction.feePayer =
  publicKey;

console.log(
  "=== BLOCKHASH FINAL POUR PHANTOM ==="
);

console.log(
  "Blockhash :",
  transaction.recentBlockhash
);



console.log(
  "Blockhash :",
  transaction.recentBlockhash
);

console.log(
  "Fee payer :",
  transaction.feePayer?.toBase58()
);

console.log(
  "Instructions :",
  transaction.instructions.length
);

/*
 * Diagnostic juste avant Phantom.
 */


console.log(
  "Signers requis :",
  transaction
    .compileMessage()
    .header.numRequiredSignatures
);

console.log(
  "Message length :",
  transaction.serializeMessage().length
);

console.log(
  "Balance SOL :",
  await connection.getBalance(publicKey)
);

/*
 * Signature Phantom.
 */
/*
 * Après la simulation, on récupère un blockhash
 * frais juste avant la signature Phantom.
 *
 * La simulation peut prendre quelques instants.
 * On évite ainsi de signer avec un blockhash
 * devenu trop ancien.
 */
const signingBlockhash =
  await connection.getLatestBlockhash(
    "confirmed"
  );
transaction.recentBlockhash =
  signingBlockhash.blockhash;

transaction.feePayer =
  publicKey;



console.log(
  "Blockhash :",
  transaction.recentBlockhash
);
transaction.recentBlockhash =
  signingBlockhash.blockhash;

transaction.feePayer =
  publicKey;



console.log(
  "Blockhash :",
  transaction.recentBlockhash
);
const signedTransaction =
  await signTransaction(
    transaction
  );
  

console.log(
  "Blockhash transaction :",
  transaction.recentBlockhash
);

console.log(
  "Blockhash signé :",
  signedTransaction.recentBlockhash
);

console.log(
  "Signature présente :",
  signedTransaction.signatures.some(
    (s) => s.signature !== null
  )
);


console.log(
  "Fee payer :",
  transaction.feePayer?.toBase58()
);

console.log(
  "Recent blockhash :",
  transaction.recentBlockhash
);

console.log(
  "Instructions :",
  transaction.instructions.length
);

console.log(
  "Transaction serialize length :",
  transaction.serializeMessage().length
);

console.log(
  "Balance SOL avant transaction :",
  await connection.getBalance(publicKey)
);

console.log(
  "Signers requis :",
  transaction
    .compileMessage()
    .header.numRequiredSignatures
);
    

      /*
       * Envoi sur Solana.
       */
      const signature =
        await connection.sendRawTransaction(
          signedTransaction.serialize(),
          {
            skipPreflight: false,
            maxRetries: 3,
          }
        );

      /*
       * Confirmation avec le même blockhash
       * que celui utilisé pour la signature.
       */
      await connection.confirmTransaction(
        {
          signature,
        blockhash:
  signingBlockhash.blockhash,
lastValidBlockHeight:
  signingBlockhash.lastValidBlockHeight,
        },
        "confirmed"
      );

      return {
        signature,
      };
      },
    [
      connected,
      publicKey,
      wallet,
      program,
      connection,
      signTransaction,
    ]
  );

  return {
    swap,
    getQuote,
    getJupiterQuote,
    previewJupiterBuild,
    swapJupiterBuild,
    swapOnJupiter,
    connected,
    publicKey,
  };
}
