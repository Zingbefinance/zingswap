"use client";

import PoolChart from "./PoolChart";
import PoolPriceChart from "./PoolPriceChart";
import { useEffect, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";

import { useLiquidity } from "../hooks/useLiquidity";
import {
  ZTC_MINT,
  WSOL_MINT,
  getPoolPda,
} from "../../../lib/anchor/zingswap";
import {
  getPoolData,
  calculatePoolPrices,
  type PoolData,
} from "../lib/pool";
import {
  getUserPositions,
  type PositionData,
} from "../lib/positions";
export default function LiquidityCard() {
  const { connection } = useConnection();

  const {
    connected,
    publicKey,
    connect,
  } = useWallet();

  const {
    loading,
    message,
    addLiquidity,
    removeLiquidity,
  } = useLiquidity();

  const [poolData, setPoolData] =
    useState<PoolData | null>(null);

  const [poolLoading, setPoolLoading] =
    useState(true);

  const [poolError, setPoolError] =
    useState<string | null>(null);
const [userPosition, setUserPosition] =
  useState<PositionData | null>(null);

const [positionLoading, setPositionLoading] =
  useState(false);

const [positionError, setPositionError] =
  useState<string | null>(null);
  const [ztcAmount, setZtcAmount] =
    useState("100");
    const [solAmount, setSolAmount] =
  useState("0.0005");

  

const [tickUpper, setTickUpper] =
  useState(100);
const [localError, setLocalError] =
  useState("");
  const poolPrices = poolData
    ? calculatePoolPrices(poolData)
    : null;

  // ==================================================
  // CHARGEMENT DU POOL
  // ==================================================

  async function loadPool() {
    try {
      setPoolLoading(true);
      setPoolError(null);

      const data = await getPoolData(connection);

      setPoolData(data);
    } catch (error) {
      console.error(
        "Erreur chargement Pool :",
        error
      );

      setPoolError(
        error instanceof Error
          ? error.message
          : "Impossible de charger le pool."
      );
    } finally {
      setPoolLoading(false);
    }
  }

  useEffect(() => {
  loadPool();
}, [connection]);

// ==================================================
// CHARGEMENT DE LA POSITION UTILISATEUR
// ==================================================

async function loadUserPosition() {
  if (!publicKey || !poolData) {
    setUserPosition(null);
    return;
  }

  try {
    setPositionLoading(true);
    setPositionError(null);

    const positions = await getUserPositions(
      connection,
      publicKey,
      poolData.address
    );

    setUserPosition(positions[0] ?? null);
  } catch (error) {
    console.error(
      "Erreur chargement position :",
      error
    );

    setPositionError(
      error instanceof Error
        ? error.message
        : "Impossible de charger la position."
    );
  } finally {
    setPositionLoading(false);
  }
}

useEffect(() => {
  loadUserPosition();
}, [connection, publicKey, poolData?.address]);

// ==================================================
// AJOUT DE LIQUIDITÉ
// ==================================================

  async function handleAddLiquidity() {
setLocalError("");
    if (!connected || !publicKey) {
      await connect();
      return;
    }

    try {
      const pool = getPoolPda(
        undefined,
        ZTC_MINT,
        WSOL_MINT
      );

      const userTokenA =
        await getAssociatedTokenAddress(
          ZTC_MINT,
          publicKey,
          false,
          TOKEN_PROGRAM_ID
        );

      const userTokenB =
        await getAssociatedTokenAddress(
          WSOL_MINT,
          publicKey,
          false,
          TOKEN_PROGRAM_ID
        );

      const tokenAInfo =
        await connection.getAccountInfo(
          userTokenA
        );

      if (!tokenAInfo) {
        throw new Error(
          `Le compte ZTC du wallet n'existe pas encore.\n\nATA ZTC : ${userTokenA.toBase58()}`
        );
      }

      const tokenBInfo =
        await connection.getAccountInfo(
          userTokenB
        );

      if (!tokenBInfo) {
        throw new Error(
          `Le compte WSOL du wallet n'existe pas encore.\n\nATA WSOL : ${userTokenB.toBase58()}`
        );
      }

      console.log(
        "Wallet connecté :",
        publicKey.toBase58()
      );

      console.log(
        "Pool :",
        pool.toBase58()
      );

      console.log(
        "User Token A (ZTC) :",
        userTokenA.toBase58()
      );

      console.log(
        "User Token B (WSOL) :",
        userTokenB.toBase58()
      );

      const amountA = new BN(
        Math.round(
          Number(ztcAmount) *
            1_000_000_000
        )
      );

      const amountB = new BN(
        Math.round(
          Number(solAmount) *
            1_000_000_000
        )
      );

      if (amountA.lte(new BN(0))) {
        throw new Error(
          "Le montant ZTC doit être supérieur à zéro."
        );
      }

      if (amountB.lte(new BN(0))) {
        throw new Error(
          "Le montant SOL doit être supérieur à zéro."
        );
      }
      const currentTick = poolData?.currentTick ?? 0;
const tickSpacing = 8;

const tickLower =
  Math.floor(
    (currentTick - 100) / tickSpacing
  ) * tickSpacing;

const tickUpper =
  Math.ceil(
    (currentTick + 100) / tickSpacing
  ) * tickSpacing;

if (tickLower >= tickUpper) {
  throw new Error(
    "La borne inférieure du tick doit être strictement inférieure à la borne supérieure."
  );
}

     await addLiquidity(
  pool,
  userTokenA,
  userTokenB,
  amountA,
  amountB,
  tickLower,
  tickUpper
);

      await loadPool();
    } catch (error) {
  console.error(
    "Erreur ajout liquidité :",
    error
  );

  setLocalError(
    error instanceof Error
      ? error.message
      : "Erreur inconnue pendant l'ajout de liquidité."
  );
}
  }

  // ==================================================
  // RETRAIT DE LIQUIDITÉ
  // ==================================================

  async function handleRemoveLiquidity() {
setLocalError("");
    if (!connected || !publicKey) {
      await connect();
      return;
    }

    try {
      const pool = getPoolPda(
        undefined,
        ZTC_MINT,
        WSOL_MINT
      );

      const userTokenA =
        await getAssociatedTokenAddress(
          ZTC_MINT,
          publicKey,
          false,
          TOKEN_PROGRAM_ID
        );

      const userTokenB =
        await getAssociatedTokenAddress(
          WSOL_MINT,
          publicKey,
          false,
          TOKEN_PROGRAM_ID
        );

      // ------------------------------------------------
      // Vérification des comptes utilisateur
      // ------------------------------------------------

      const tokenAInfo =
        await connection.getAccountInfo(
          userTokenA
        );

      if (!tokenAInfo) {
        throw new Error(
          `Le compte ZTC du wallet n'existe pas.\n\nATA ZTC : ${userTokenA.toBase58()}`
        );
      }

      const tokenBInfo =
        await connection.getAccountInfo(
          userTokenB
        );

      if (!tokenBInfo) {
        throw new Error(
          `Le compte WSOL du wallet n'existe pas.\n\nATA WSOL : ${userTokenB.toBase58()}`
        );
      }

      console.log(
        "REMOVE LIQUIDITY"
      );

      console.log(
        "Wallet :",
        publicKey.toBase58()
      );

      console.log(
        "Pool :",
        pool.toBase58()
      );

      console.log(
        "User Token A :",
        userTokenA.toBase58()
      );

      console.log(
        "User Token B :",
        userTokenB.toBase58()
      );

      // ------------------------------------------------
      // Retrait complet de la position
      // ------------------------------------------------

      if (!userPosition) {
  throw new Error(
    "Aucune position ZTC / WSOL trouvée pour ce wallet."
  );
}

console.log(
  "Position :",
  userPosition.address.toBase58()
);

console.log(
  "Tick lower :",
  userPosition.tickLower
);

console.log(
  "Tick upper :",
  userPosition.tickUpper
);

await removeLiquidity(
  pool,
  userTokenA,
  userTokenB,
  userPosition.tickLower,
  userPosition.tickUpper
);

      // ------------------------------------------------
      // Actualisation des réserves
      // ------------------------------------------------

      await loadPool();
      await loadUserPosition();
    } catch (error) {
  console.error(
    "Erreur retrait liquidité :",
    error
  );

  setLocalError(
    error instanceof Error
      ? error.message
      : "Erreur inconnue pendant le retrait."
  );
}
  }

  // ==================================================
  // FORMATAGE
  // ==================================================

  function formatTokenAmount(
    amount: bigint
  ) {
    return (
      Number(amount) / 1_000_000_000
    ).toLocaleString("fr-FR", {
      maximumFractionDigits: 9,
    });
  }

  // ==================================================
  // INTERFACE
  // ==================================================

  return (
    <div className="w-full max-w-md space-y-4 md:space-y-5">

      {/* ==============================================
          INFORMATIONS DU POOL
      ============================================== */}

      <div className="rounded-2xl border bg-white p-4 md:p-6 shadow-lg dark:bg-zinc-900">

        <div className="mb-5 flex items-center justify-between">

          <h2 className="text-xl md:text-2xl font-bold">
            Pool ZTC / WSOL
          </h2>

          <button
            type="button"
            onClick={loadPool}
            disabled={poolLoading}
            className="rounded-lg border px-3 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {poolLoading
              ? "..."
              : "Actualiser"}
          </button>

        </div>

        {poolError && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {poolError}
          </div>
        )}

        {poolData && (
          <div className="space-y-3">

            {poolPrices && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <div className="rounded-xl border p-3">

                  <p className="text-xs text-zinc-500">
                    Prix ZTC
                  </p>

                  <p className="mt-1 font-semibold">
                    1 ZTC ={" "}
                    {poolPrices.wsolPerZtc.toFixed(
                      9
                    )}{" "}
                    WSOL
                  </p>

                </div>

                <div className="rounded-xl border p-3">

                  <p className="text-xs text-zinc-500">
                    Prix WSOL
                  </p>

                  <p className="mt-1 font-semibold">
                    1 WSOL ={" "}
                    {poolPrices.ztcPerWsol.toFixed(
                      6
                    )}{" "}
                    ZTC
                  </p>

                </div>

              </div>
            )}

            <div className="rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800">

              <p className="text-xs text-zinc-500">
                Réserve ZTC
              </p>

              <p className="mt-1 text-xl font-semibold">
                {formatTokenAmount(
                  poolData.reserveA
                )}{" "}
                ZTC
              </p>

            </div>

            <div className="rounded-xl bg-zinc-100 p-4 dark:bg-zinc-800">

              <p className="text-xs text-zinc-500">
                Réserve WSOL
              </p>

              <p className="mt-1 text-xl font-semibold">
                {formatTokenAmount(
                  poolData.reserveB
                )}{" "}
                WSOL
              </p>

            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              <div className="rounded-xl border p-3">

                <p className="text-xs text-zinc-500">
                  Frais
                </p>

                <p className="font-semibold">
                  {poolData.feeBps / 100}%
                </p>

              </div>

              <div className="rounded-xl border p-3">

                <p className="text-xs text-zinc-500">
                  Tick
                </p>

                <p className="font-semibold">
                  {poolData.currentTick}
                </p>

              </div>

            </div>

            <div className="rounded-xl border p-3">

              <p className="text-xs text-zinc-500">
                Liquidité CLMM
              </p>

              <p className="mt-1 break-all font-mono text-sm">
                {poolData.liquidity.toString()}
              </p>

            </div>

            <div className="rounded-xl border p-3">

              <p className="text-xs text-zinc-500">
                Pool
              </p>

              <p className="mt-1 break-all font-mono text-xs">
                {poolData.address.toBase58()}
              </p>

            </div>

          </div>
        )}

      </div>

      {/* ==============================================
          GRAPHIQUES
      ============================================== */}

      {poolData && (
        <PoolChart pool={poolData} />
      )}

      {poolPrices && (
        <PoolPriceChart
          prices={poolPrices}
        />
      )}
      {/* ==============================================
    POSITION CLMM
============================================== */}

<div className="rounded-2xl border bg-white p-4 md:p-6 text-zinc-900 shadow-lg dark:bg-zinc-900 dark:text-white">

  <h2 className="mb-5 text-xl md:text-2xl font-bold">
    Ma position CLMM
  </h2>

  {positionLoading && (
    <p className="text-sm text-zinc-500">
      Chargement de la position...
    </p>
  )}

  {positionError && (
    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
      {positionError}
    </div>
  )}

  {!positionLoading &&
    !positionError &&
    !userPosition && (
      <p className="text-sm text-zinc-500">
        Aucune position ZTC / WSOL trouvée.
      </p>
    )}

  {userPosition && (
    <div className="space-y-3">

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        <div className="rounded-xl border p-3">
          <p className="text-xs text-zinc-500">
            Tick inférieur
          </p>

          <p className="mt-1 font-semibold">
            {userPosition.tickLower}
          </p>
        </div>

        <div className="rounded-xl border p-3">
          <p className="text-xs text-zinc-500">
            Tick supérieur
          </p>

          <p className="mt-1 font-semibold">
            {userPosition.tickUpper}
          </p>
        </div>

      </div>

      <div className="rounded-xl border p-3">
        <p className="text-xs text-zinc-500">
          Liquidité de la position
        </p>

        <p className="mt-1 break-all font-mono text-sm">
          {userPosition.liquidity.toString()}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        <div className="rounded-xl border p-3">
          <p className="text-xs text-zinc-500">
            ZTC déposé
          </p>

          <p className="mt-1 font-semibold">
            {formatTokenAmount(
              userPosition.amountADeposited
            )}{" "}
            ZTC
          </p>
        </div>

        <div className="rounded-xl border p-3">
          <p className="text-xs text-zinc-500">
            WSOL déposé
          </p>

          <p className="mt-1 font-semibold">
            {formatTokenAmount(
              userPosition.amountBDeposited
            )}{" "}
            WSOL
          </p>
        </div>

      </div>

      <div className="rounded-xl border p-3">
        <p className="text-xs text-zinc-500">
          Position PDA
        </p>

        <p className="mt-1 break-all font-mono text-xs">
          {userPosition.address.toBase58()}
        </p>
      </div>

    </div>
  )}

</div>

      {/* ==============================================
          AJOUT DE LIQUIDITÉ
      ============================================== */}

      <div className="rounded-2xl border bg-white p-4 md:p-6 text-zinc-900 shadow-lg dark:bg-zinc-900 dark:text-white">
        <h2 className="mb-5 text-center text-2xl font-bold">
          Ajouter de la liquidité
        </h2>

        <div className="mb-4">

          <label className="mb-1 block text-sm">
            ZTC
          </label>

          <input
            type="number"
            min="0"
            step="0.000000001"
            value={ztcAmount}
            onChange={(e) =>
              setZtcAmount(e.target.value)
            }
            className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-black outline-none focus:border-black focus:ring-2 focus:ring-zinc-300"
          />

        </div>

        <div className="mb-5">

          <label className="mb-1 block text-sm">
            SOL
          </label>

          <input
            type="number"
            min="0"
            step="0.000000001"
            value={solAmount}
            onChange={(e) =>
              setSolAmount(e.target.value)
            }
            className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-black outline-none focus:border-black focus:ring-2 focus:ring-zinc-300"
          />

        </div>

        <button
          type="button"
          onClick={handleAddLiquidity}
          disabled={loading}
          className="w-full rounded-lg bg-black py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Préparation..."
            : connected
            ? "Ajouter la liquidité"
            : "Connecter le wallet"}
        </button>
{localError && (
  <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
    {localError}
  </div>
)}
      </div>

      {/* ==============================================
          RETRAIT DE LIQUIDITÉ
      ============================================== */}
      <div className="rounded-2xl border bg-white p-4 md:p-6 text-zinc-900 shadow-lg dark:bg-zinc-900 dark:text-white">

        <h2 className="mb-2 text-center text-2xl font-bold">
          Retirer la liquidité
        </h2>

        <p className="mb-5 text-center text-sm text-zinc-500">
          Retire la totalité de ta position
          ZTC / WSOL.
        </p>

        <button
          type="button"
          onClick={handleRemoveLiquidity}
          disabled={loading}
          className="w-full rounded-lg bg-black py-3 text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Retrait en cours..."
            : connected
            ? "Retirer toute la liquidité"
            : "Connecter le wallet"}
        </button>

      </div>

      {/* ==============================================
          MESSAGE TRANSACTION
      ============================================== */}

      {message && (
        <div className="rounded-2xl border bg-white p-4 shadow-lg dark:bg-zinc-900">

          <p className="break-all text-center text-sm text-green-600">
            {message}
          </p>

        </div>
      )}

    </div>
  );
}
