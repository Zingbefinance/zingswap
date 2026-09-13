"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AnchorProvider, BN, Program } from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  PublicKey,
  SystemProgram,
  Transaction,
} from "@solana/web3.js";

import idl from "../../src/lib/anchor/zingswap.json";

const ZINGSWAP_PROGRAM_ID = new PublicKey(
  "EfPqnPQ5wzdV4Uv7SRKQVUGDjBna2YrLKWUDZLAz9Lna",
);

const ZTC_MINT = new PublicKey(
  "4zihBzwHLx9z7aNmXam181iUd285xbqJNN57M5LhoHpu",
);

const WSOL_MINT = new PublicKey(
  "So11111111111111111111111111111111111111112",
);

const ZINGSWAP_TREASURY = new PublicKey(
  "3rK2JZQ2E4QX5xHvzvRbvGMzaHXUmqECvuuzbuawSjHq",
);

const FEE_BPS = 30;
const SLIPPAGE_BPS = 50;
const BPS_DENOMINATOR = 10_000;

function getPoolPda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pool"),
      ZTC_MINT.toBuffer(),
      WSOL_MINT.toBuffer(),
    ],
    ZINGSWAP_PROGRAM_ID,
  )[0];
}

function getVaultPdas(pool: PublicKey) {
  const vaultA = PublicKey.findProgramAddressSync(
    [
      Buffer.from("vault_a"),
      pool.toBuffer(),
    ],
    ZINGSWAP_PROGRAM_ID,
  )[0];

  const vaultB = PublicKey.findProgramAddressSync(
    [
      Buffer.from("vault_b"),
      pool.toBuffer(),
    ],
    ZINGSWAP_PROGRAM_ID,
  )[0];

  return { vaultA, vaultB };
}

function toBaseUnits(
  amount: number,
  decimals: number,
): BN {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Montant invalide.");
  }

  const value = amount.toFixed(decimals);
  const [whole, fraction = ""] =
    value.split(".");

  const units =
    `${whole}${fraction.padEnd(decimals, "0")}`;

  return new BN(units);
}

function calculateMinAmountOut(
  amountIn: BN,
  reserveIn: BN,
  reserveOut: BN,
): BN {
  if (
    reserveIn.isZero() ||
    reserveOut.isZero()
  ) {
    throw new Error(
      "Les réserves du pool sont insuffisantes.",
    );
  }

  /*
   * Même logique que le programme ZingSwap :
   *
   * fee = amountIn * 30 / 10000
   * amountAfterFee = amountIn - fee
   *
   * amountOut =
   * reserveOut * amountAfterFee
   * ----------------------------
   * reserveIn + amountAfterFee
   */

  const feeAmount = amountIn
    .muln(FEE_BPS)
    .divn(BPS_DENOMINATOR);

  const amountAfterFee =
    amountIn.sub(feeAmount);

  if (amountAfterFee.isZero()) {
    throw new Error(
      "Le montant après frais est trop faible.",
    );
  }

  const expectedAmountOut =
    reserveOut
      .mul(amountAfterFee)
      .div(
        reserveIn.add(amountAfterFee),
      );

  if (expectedAmountOut.isZero()) {
    throw new Error(
      "La sortie estimée du swap est trop faible.",
    );
  }

  /*
   * Slippage maximum : 0,50 %
   *
   * minAmountOut =
   * expectedAmountOut * 99,5 %
   */

  const minAmountOut =
    expectedAmountOut
      .muln(
        BPS_DENOMINATOR -
          SLIPPAGE_BPS,
      )
      .divn(BPS_DENOMINATOR);

  if (minAmountOut.isZero()) {
    throw new Error(
      "Le montant minimum de sortie est invalide.",
    );
  }

  return minAmountOut;
}

export default function useSwap() {
  const { connection } = useConnection();

  const {
    connected,
    publicKey,
    signTransaction,
    signAllTransactions,
  } = useWallet();

  async function executeSwap(
    amount: number,
    aToB: boolean,
  ): Promise<string | undefined> {
    if (
      !connected ||
      !publicKey ||
      !signTransaction
    ) {
      alert(
        "Connectez votre portefeuille.",
      );
      return;
    }

    try {
      const provider = new AnchorProvider(
        connection,
        {
          publicKey,
          signTransaction,
          signAllTransactions:
            signAllTransactions!,
        },
        {
          commitment: "confirmed",
        },
      );

      const program = new Program(
        idl as any,
        provider,
      );

      const pool = getPoolPda();

      const {
        vaultA,
        vaultB,
      } = getVaultPdas(pool);

      const inputMint = aToB
        ? ZTC_MINT
        : WSOL_MINT;

      const outputMint = aToB
        ? WSOL_MINT
        : ZTC_MINT;

      const userInput =
        getAssociatedTokenAddressSync(
          inputMint,
          publicKey,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );

      const userOutput =
        getAssociatedTokenAddressSync(
          outputMint,
          publicKey,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );

      const treasuryInput =
        getAssociatedTokenAddressSync(
          inputMint,
          ZINGSWAP_TREASURY,
          false,
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );

      const amountIn =
        toBaseUnits(amount, 9);

      /*
       * Lecture des réserves réelles
       * du pool juste avant la construction
       * du swap.
       */

      const [
        vaultABalance,
        vaultBBalance,
      ] = await Promise.all([
        connection.getTokenAccountBalance(
          vaultA,
          "confirmed",
        ),
        connection.getTokenAccountBalance(
          vaultB,
          "confirmed",
        ),
      ]);

      const reserveA = new BN(
        vaultABalance.value.amount,
      );

      const reserveB = new BN(
        vaultBBalance.value.amount,
      );

      /*
       * pool.token_a = ZTC
       * pool.token_b = WSOL
       *
       * aToB = true  : ZTC -> WSOL
       * aToB = false : WSOL -> ZTC
       */

      const reserveIn = aToB
        ? reserveA
        : reserveB;

      const reserveOut = aToB
        ? reserveB
        : reserveA;

      const minAmountOut =
        calculateMinAmountOut(
          amountIn,
          reserveIn,
          reserveOut,
        );

      console.log(
        "ZingSwap protection slippage :",
        {
          amountIn:
            amountIn.toString(),
          reserveIn:
            reserveIn.toString(),
          reserveOut:
            reserveOut.toString(),
          minAmountOut:
            minAmountOut.toString(),
          feeBps: FEE_BPS,
          slippageBps:
            SLIPPAGE_BPS,
        },
      );

      const transaction =
        new Transaction();

      /*
       * SOL natif -> WSOL
       *
       * Le programme ZingSwap reçoit
       * un compte SPL Token WSOL.
       *
       * Nous devons donc déposer le SOL
       * natif dans l'ATA WSOL puis
       * synchroniser son montant en WSOL.
       */

      if (!aToB) {
        const inputInfo =
          await connection.getAccountInfo(
            userInput,
          );

        if (!inputInfo) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              userInput,
              publicKey,
              WSOL_MINT,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID,
            ),
          );
        }

        transaction.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: userInput,
            lamports:
              amountIn.toNumber(),
          }),
        );

        transaction.add(
          createSyncNativeInstruction(
            userInput,
          ),
        );
      } else {
        const inputInfo =
          await connection.getAccountInfo(
            userInput,
          );

        if (!inputInfo) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              userInput,
              publicKey,
              inputMint,
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID,
            ),
          );
        }
      }

      const outputInfo =
        await connection.getAccountInfo(
          userOutput,
        );

      if (!outputInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            userOutput,
            publicKey,
            outputMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        );
      }

      const treasuryInfo =
        await connection.getAccountInfo(
          treasuryInput,
        );

      if (!treasuryInfo) {
        transaction.add(
          createAssociatedTokenAccountInstruction(
            publicKey,
            treasuryInput,
            ZINGSWAP_TREASURY,
            inputMint,
            TOKEN_PROGRAM_ID,
            ASSOCIATED_TOKEN_PROGRAM_ID,
          ),
        );
      }

      const swapInstruction =
        await program.methods
          .swap(
            amountIn,
            aToB,
            minAmountOut,
          )
          .accounts({
            pool,
            userInput,
            userOutput,
            treasuryInput,
            vaultA,
            vaultB,
            user: publicKey,
            tokenProgram:
              TOKEN_PROGRAM_ID,
          })
          .instruction();

      transaction.add(
        swapInstruction,
      );

      const latestBlockhash =
        await connection.getLatestBlockhash(
          "confirmed",
        );

      transaction.recentBlockhash =
        latestBlockhash.blockhash;

      transaction.feePayer =
        publicKey;

      const signedTransaction =
        await signTransaction(
          transaction,
        );

      const signature =
        await connection.sendRawTransaction(
          signedTransaction.serialize(),
          {
            skipPreflight: false,
            preflightCommitment:
              "confirmed",
          },
        );

      await connection.confirmTransaction(
        {
          signature,
          blockhash:
            latestBlockhash.blockhash,
          lastValidBlockHeight:
            latestBlockhash.lastValidBlockHeight,
        },
        "confirmed",
      );

      console.log(
        "ZingSwap swap confirmé :",
        signature,
      );

      alert(
        `Swap réussi !\nSignature : ${signature}`,
      );

      return signature;
    } catch (error) {
      console.error(
        "Erreur ZingSwap :",
        error,
      );

      const message =
        error instanceof Error
          ? error.message
          : "Erreur inconnue.";

      alert(
        `Échec du swap ZingSwap.\n${message}`,
      );
    }
  }

  async function swapSolToZing(
    amount: number,
  ) {
    return executeSwap(
      amount,
      false,
    );
  }

  async function swapZingToSol(
    amount: number,
  ) {
    return executeSwap(
      amount,
      true,
    );
  }

  return {
    swapSolToZing,
    swapZingToSol,
  };
}