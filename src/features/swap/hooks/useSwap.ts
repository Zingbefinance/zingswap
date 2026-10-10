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
  PublicKey,
  SystemProgram,
  Transaction,
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
  amountIn: string;
  amountOut: string;
  amountInRaw: string;
  amountOutRaw: string;
  feeRaw: string;
  feeBps: number;
  minAmountOutRaw: string;
}

export interface JupiterQuoteResult {
  amountIn: string;
  amountOut: string;
  amountInRaw: string;
  amountOutRaw: string;
  router: string | null;
  route: string[];
  feeBps: number | null;
  feeAmountRaw: string | null;
  feeAmount: string | null;
  feeMint: string | null;
  platformFeeBps: number | null;
  referralFeeBpsRequested: number | null;
  referralConfirmed: boolean;
  referralNetBps: number | null;
  poolFees: null;
  priceImpact: number | null;
  signatureFeeLamports: number | null;
  prioritizationFeeLamports: number | null;
  rentFeeLamports: number | null;
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
}

interface JupiterExecuteResult {
  status: "Success" | "Failed";
  signature: string | null;
  code: number | null;
  error: string | null;
  totalInputAmount: string | null;
  totalOutputAmount: string | null;
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


const outputBase = 10 ** outputDecimals;

if (amountOutRaw <= BigInt(0)) {
  throw new Error(
    "Le montant de sortie est trop petit."
  );
}

return {
  amountIn: amount,
  amountOut: (
    Number(amountOutRaw) /
    outputBase
  ).toFixed(6),
  amountInRaw:
    amountInRaw.toString(),
  amountOutRaw:
    amountOutRaw.toString(),
  minAmountOutRaw: ((amountOutRaw * BigInt(10_000 - slippageBps)) / BigInt(10_000)).toString(),
  feeRaw:
    fee.toString(),
  feeBps,
};
    },
    [connection]
  );

  const getJupiterQuote = useCallback(
    async ({
      amount,
      fromMint,
      toMint,
      slippageBps,
      signal,
    }: {
      amount: string;
      fromMint: PublicKey;
      toMint: PublicKey;
      slippageBps: number;
      signal?: AbortSignal;
    }): Promise<JupiterQuoteResult> => {
      const [inputToken, outputToken] = await Promise.all([
        getTokenByMint(fromMint.toBase58()),
        getTokenByMint(toMint.toBase58()),
      ]);

      if (!inputToken || !outputToken) {
        throw new Error("Métadonnées des tokens indisponibles pour la route externe.");
      }

      const amountInRaw = toRawAmount(amount, inputToken.decimals).toString();
      const response = await fetch("/api/jupiter/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMint: fromMint.toBase58(),
          outputMint: toMint.toBase58(),
          amount: amountInRaw,
          inputDecimals: inputToken.decimals,
          outputDecimals: outputToken.decimals,
          slippageBps,
        }),
        cache: "no-store",
        signal,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "La cotation externe est indisponible."
        );
      }

      return result as JupiterQuoteResult;
    },
    []
  );

  const swapOnJupiter = useCallback(
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
    }): Promise<{ signature: string; amountOut: string | null }> => {
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
        throw new Error("Impossible de préparer la transaction via la route externe.");
      }
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

      return { signature: result.signature, amountOut: result.totalOutputAmount };
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
    swapOnJupiter,
    connected,
    publicKey,
  };
}
