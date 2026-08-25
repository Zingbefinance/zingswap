"use client";

import { useState } from "react";
import { BN } from "@coral-xyz/anchor";

import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";

import {
  PublicKey,
  SendTransactionError,
} from "@solana/web3.js";

import { buildAddLiquidityTransaction } from "../lib/addLiquidity";
import { buildRemoveLiquidityTransaction } from "../lib/removeLiquidity";

export function useLiquidity() {
  const { connection } = useConnection();

  const {
    publicKey,
    sendTransaction,
  } = useWallet();

  const wallet = useWallet();

  const [loading, setLoading] = useState(false);

  const [message, setMessage] =
    useState<string | null>(null);

  // ==================================================
  // AJOUT DE LIQUIDITÉ
  // ==================================================

  async function addLiquidity(
    pool: PublicKey,
    userTokenA: PublicKey,
    userTokenB: PublicKey,
    amountA: BN,
    amountB: BN,
    tickLower: number,
    tickUpper: number
  ) {
    if (!publicKey) {
      throw new Error("Connecte ton wallet.");
    }

    if (!sendTransaction) {
      throw new Error(
        "Ce wallet ne permet pas l'envoi de transaction."
      );
    }

    setLoading(true);
    setMessage(null);

    try {
      const { transaction } =
        await buildAddLiquidityTransaction({
          connection,
          wallet: wallet as never,
          pool,
          userTokenA,
          userTokenB,
          amountA,
          amountB,
          tickLower,
          tickUpper,
        });

      // --------------------------------------------------
      // Simulation
      // --------------------------------------------------

      const simulation =
        await connection.simulateTransaction(
          transaction
        );

      console.log(
        "ADD LIQUIDITY Simulation error :",
        simulation.value.err
      );

      console.log(
        "ADD LIQUIDITY Simulation logs :",
        simulation.value.logs
      );

      if (simulation.value.err) {
        throw new Error(
          `La simulation de l'ajout de liquidité a échoué : ${JSON.stringify(
            simulation.value.err
          )}`
        );
      }

      // --------------------------------------------------
      // Envoi
      // --------------------------------------------------

      const signature =
        await sendTransaction(
          transaction,
          connection,
          {
            skipPreflight: false,
            maxRetries: 5,
          }
        );

      // --------------------------------------------------
      // Confirmation
      // --------------------------------------------------

      await connection.confirmTransaction(
        signature,
        "confirmed"
      );

      setMessage(
        `Liquidité ajoutée : ${signature}`
      );

      return signature;
    } catch (error) {
      if (error instanceof SendTransactionError) {
        const logs =
          await error.getLogs(connection);

        console.error(
          "Logs Anchor ADD LIQUIDITY :",
          logs
        );
      }

      console.error(
        "Erreur ajout de liquidité :",
        error
      );

      throw error;
    } finally {
      setLoading(false);
    }
  }

  // ==================================================
  // RETRAIT DE LIQUIDITÉ
  // ==================================================

  async function removeLiquidity(
    pool: PublicKey,
    userTokenA: PublicKey,
    userTokenB: PublicKey,
    tickLower: number,
    tickUpper: number
  ) {
    if (!publicKey) {
      throw new Error("Connecte ton wallet.");
    }

    if (!sendTransaction) {
      throw new Error(
        "Ce wallet ne permet pas l'envoi de transaction."
      );
    }

    setLoading(true);
    setMessage(null);

    try {
      const { transaction } =
        await buildRemoveLiquidityTransaction({
          connection,
          wallet: wallet as never,
          pool,
          userTokenA,
          userTokenB,
          tickLower,
          tickUpper,
        });

      // --------------------------------------------------
      // Simulation
      // --------------------------------------------------

      const simulation =
        await connection.simulateTransaction(
          transaction
        );

      console.log(
        "REMOVE LIQUIDITY Simulation error :",
        simulation.value.err
      );

      console.log(
        "REMOVE LIQUIDITY Simulation logs :",
        simulation.value.logs
      );

      if (simulation.value.err) {
        throw new Error(
          `La simulation du retrait de liquidité a échoué : ${JSON.stringify(
            simulation.value.err
          )}`
        );
      }

      // --------------------------------------------------
      // Envoi
      // --------------------------------------------------

      const signature =
        await sendTransaction(
          transaction,
          connection,
          {
            skipPreflight: false,
            maxRetries: 5,
          }
        );

      // --------------------------------------------------
      // Confirmation
      // --------------------------------------------------

      await connection.confirmTransaction(
        signature,
        "confirmed"
      );

      setMessage(
        `Liquidité retirée : ${signature}`
      );

      return signature;
    } catch (error) {
      if (error instanceof SendTransactionError) {
        const logs =
          await error.getLogs(connection);

        console.error(
          "Logs Anchor REMOVE LIQUIDITY :",
          logs
        );
      }

      console.error(
        "Erreur retrait de liquidité :",
        error
      );

      throw error;
    } finally {
      setLoading(false);
    }
  }

  return {
    loading,
    message,
    addLiquidity,
    removeLiquidity,
  };
}