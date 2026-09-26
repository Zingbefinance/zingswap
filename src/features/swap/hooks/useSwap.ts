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
    }: {
      amount: string;
      fromMint: PublicKey;
      toMint: PublicKey;
    }): Promise<QuoteResult> => {
      const isZtcToWsol =
        fromMint.equals(ZTC_MINT) &&
        toMint.equals(WSOL_MINT);

      const isWsolToZtc =
        fromMint.equals(WSOL_MINT) &&
        toMint.equals(ZTC_MINT);

      if (!isZtcToWsol && !isWsolToZtc) {
        throw new Error(
          "Cette paire n'est pas supportée par le pool ZTC/WSOL."
        );
      }

      const inputDecimals = isZtcToWsol ? 6 : 9;

const amountInRaw = toRawAmount(
  amount,
  inputDecimals
);

      const poolPda = getPoolPda(
        ZINGSWAP_PROGRAM_ID,
        ZTC_MINT,
        WSOL_MINT
      );

      const { vaultA, vaultB } =
        getVaultPdas(
          ZINGSWAP_PROGRAM_ID,
          poolPda
        );

      const inputVault = isZtcToWsol
        ? vaultA
        : vaultB;

      const outputVault = isZtcToWsol
        ? vaultB
        : vaultA;

      const inputAccount =
        await getAccount(
          connection,
          inputVault
        );

      const outputAccount =
        await getAccount(
          connection,
          outputVault
        );

      const poolInfo =
        await connection.getAccountInfo(
          poolPda
        );

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

const outputDecimals = isZtcToWsol ? 9 : 6;
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
  feeRaw:
    fee.toString(),
  feeBps,
};
    },
    [connection]
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

      const isZtcToWsol =
        fromMint.equals(ZTC_MINT) &&
        toMint.equals(WSOL_MINT);

      const isWsolToZtc =
        fromMint.equals(WSOL_MINT) &&
        toMint.equals(ZTC_MINT);

      if (
        !isZtcToWsol &&
        !isWsolToZtc
      ) {
        throw new Error(
          "Cette paire n'est pas supportée par le pool ZTC/WSOL."
        );
      }

      const fromDecimals = isZtcToWsol ? 6 : 9;
const toDecimals = isZtcToWsol ? 9 : 6;

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

      const poolPda = getPoolPda(
        ZINGSWAP_PROGRAM_ID,
        ZTC_MINT,
        WSOL_MINT
      );

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
      if (isWsolToZtc) {
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
      const aToB =
        isZtcToWsol;

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
    connected,
    publicKey,
  };
}