"use client";

import PoolChart from "./PoolChart";
import { useEffect, useState } from "react";
import { BN } from "@coral-xyz/anchor";
import {
  getAccount,
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
  type PoolData,
} from "../lib/pool";
import {
  getUserPositions,
  type PositionData,
} from "../lib/positions";

const ZTC_DECIMALS = 6;
const WSOL_DECIMALS = 9;

function parseTokenAmount(value: string, decimals: number, tokenName: string): bigint {
  const normalized = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    throw new Error(`Saisis un montant ${tokenName} valide, supérieur à zéro.`);
  }

  const [whole = "0", fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) {
    throw new Error(`${tokenName} accepte au maximum ${decimals} décimales.`);
  }

  const rawAmount =
    BigInt(whole || "0") * BigInt(10) ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0");
  if (rawAmount <= BigInt(0)) {
    throw new Error(`Le montant ${tokenName} doit être supérieur à zéro.`);
  }

  return rawAmount;
}

function formatTokenBalance(amount: bigint, decimals: number): string {
  const scale = BigInt(10) ** BigInt(decimals);
  const whole = amount / scale;
  const fraction = (amount % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

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
  const [ztcUsdPrice, setZtcUsdPrice] = useState<number | null>(null);
  const [ztcPriceUnavailable, setZtcPriceUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setZtcUsdPrice(null);
    setZtcPriceUnavailable(false);
    fetch(`/api/tokens/prices?mints=${ZTC_MINT.toBase58()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Prix indisponible");
        return response.json() as Promise<{ prices?: Record<string, { usd: number }> }>;
      })
      .then((data) => {
        if (cancelled) return;
        const price = data.prices?.[ZTC_MINT.toBase58()]?.usd;
        if (typeof price === "number" && Number.isFinite(price) && price > 0) setZtcUsdPrice(price);
        else setZtcPriceUnavailable(true);
      })
      .catch(() => { if (!cancelled) setZtcPriceUnavailable(true); });
    return () => { cancelled = true; };
  }, []);

  // ==================================================
  // CHARGEMENT DU POOL
  // ==================================================

  async function loadPool() {
    try {
      setPoolLoading(true);
      setPoolError(null);

      const data = await getPoolData(
  connection,
  ZTC_MINT,
  WSOL_MINT
);

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

      let tokenAAccount;
      try {
        tokenAAccount = await getAccount(connection, userTokenA, "confirmed", TOKEN_PROGRAM_ID);
      } catch {
        throw new Error("Le compte token ZTC est introuvable ou illisible. Crée-le et approvisionne-le avant de continuer.");
      }
      if (!tokenAAccount.mint.equals(ZTC_MINT) || !tokenAAccount.owner.equals(publicKey)) {
        throw new Error("Le compte token ZTC ne correspond pas au mint ou au wallet connecté.");
      }

      let tokenBAccount;
      try {
        tokenBAccount = await getAccount(connection, userTokenB, "confirmed", TOKEN_PROGRAM_ID);
      } catch {
        throw new Error("Le compte token WSOL est introuvable ou illisible. Crée-le et approvisionne-le avant de continuer.");
      }
      if (!tokenBAccount.mint.equals(WSOL_MINT) || !tokenBAccount.owner.equals(publicKey)) {
        throw new Error("Le compte token WSOL ne correspond pas au mint ou au wallet connecté.");
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

      const amountARaw = parseTokenAmount(ztcAmount, ZTC_DECIMALS, "ZTC");
      const amountBRaw = parseTokenAmount(solAmount, WSOL_DECIMALS, "WSOL");

      if (amountARaw > tokenAAccount.amount) {
        throw new Error(`Solde ZTC insuffisant : demandé ${formatTokenBalance(amountARaw, ZTC_DECIMALS)} ZTC, disponible ${formatTokenBalance(tokenAAccount.amount, ZTC_DECIMALS)} ZTC.`);
      }
      if (amountBRaw > tokenBAccount.amount) {
        throw new Error(`Solde WSOL insuffisant : demandé ${formatTokenBalance(amountBRaw, WSOL_DECIMALS)} WSOL, disponible ${formatTokenBalance(tokenBAccount.amount, WSOL_DECIMALS)} WSOL.`);
      }

      const amountA = new BN(amountARaw.toString());
      const amountB = new BN(amountBRaw.toString());
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
    amount: bigint,
    decimals: number
  ) {
    return (
      Number(amount) / 10 ** decimals
    ).toLocaleString("fr-FR", {
      maximumFractionDigits: decimals,
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

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:p-5 text-white shadow-lg">

        <div className="mb-4 flex items-center justify-between">

  <div>
    <h2 className="text-lg font-bold">
      ZTC / WSOL
    </h2>

    <p className="mt-1 text-xs text-zinc-500">
      Liquidity Pool
    </p>
  </div>

          <button
  type="button"
  onClick={loadPool}
  disabled={poolLoading}
  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
>
  {poolLoading ? "..." : "Actualiser"}
</button>

        </div>

        {poolError && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {poolError}
          </div>
        )}

        {poolData && (
          <div className="space-y-3">

            <p className="text-sm text-zinc-400">
              {ztcUsdPrice != null
                ? <>Prix ZTC : ${ztcUsdPrice.toPrecision(6)} · source DexScreener · paire Solana avec au moins 50 000 $ de liquidité</>
                : ztcPriceUnavailable
                  ? "Prix ZTC indisponible · aucune paire Solana suffisamment liquide sur DexScreener."
                  : "Chargement du prix ZTC · source DexScreener, paire Solana avec au moins 50 000 $ de liquidité…"}
            </p>
            <a
              href={`https://explorer.solana.com/address/${poolData.address.toBase58()}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center break-all text-sm text-cyan-300 underline underline-offset-4"
            >
              Pool ZTC / WSOL : {poolData.address.toBase58()} · Explorateur Solana
            </a>

            <div className="rounded-xl bg-zinc-900 p-3">

  <p className="text-xs text-zinc-500">
    ZTC Reserve
  </p>

  <p className="mt-1 text-sm font-semibold text-white">
    {formatTokenAmount(
      poolData.reserveA,
      ZTC_DECIMALS
    )}{" "}
    ZTC
  </p>

</div>

            <div className="rounded-xl bg-zinc-900 p-3">

  <p className="text-xs text-zinc-500">
    WSOL Reserve
  </p>

  <p className="mt-1 text-sm font-semibold text-white">
    {formatTokenAmount(
      poolData.reserveB,
      WSOL_DECIMALS
    )}{" "}
    WSOL
  </p>

</div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

  <div className="rounded-xl bg-zinc-900 p-3">

    <p className="text-xs text-zinc-500">
      Fee
    </p>

    <p className="mt-1 text-sm font-semibold text-white">
      {poolData.feeBps / 100}%
    </p>

  </div>

  <div className="rounded-xl bg-zinc-900 p-3">

    <p className="text-xs text-zinc-500">
      Current Tick
    </p>

    <p className="mt-1 text-sm font-semibold text-white">
      {poolData.currentTick}
    </p>

  </div>

</div>

            <div className="rounded-xl bg-zinc-900 p-3">

  <p className="text-xs text-zinc-500">
    Pool Liquidity
  </p>

  <p className="mt-1 break-all font-mono text-sm text-white">
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

      {/* ==============================================
    POSITION CLMM
============================================== */}

<div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:p-5 text-white shadow-lg">

  <div className="mb-4 flex items-center justify-between">
    <div>
      <h2 className="text-lg font-bold">
        Your Position
      </h2>

      <p className="mt-1 text-xs text-zinc-500">
        ZTC / WSOL
      </p>
    </div>

    <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
      CLMM
    </span>
  </div>

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

  <div className="rounded-xl bg-zinc-900 p-3">
    <p className="text-xs text-zinc-500">
      Lower Tick
    </p>

    <p className="mt-1 text-sm font-semibold text-white">
      {userPosition.tickLower}
    </p>
  </div>

  <div className="rounded-xl bg-zinc-900 p-3">
    <p className="text-xs text-zinc-500">
      Upper Tick
    </p>

    <p className="mt-1 text-sm font-semibold text-white">
      {userPosition.tickUpper}
    </p>
  </div>

</div>

      <div className="rounded-xl bg-zinc-900 p-3">
  <p className="text-xs text-zinc-500">
    Position Liquidity
  </p>

  <p className="mt-1 break-all font-mono text-sm text-white">
    {userPosition.liquidity.toString()}
  </p>
</div>

     <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

  <div className="rounded-xl bg-zinc-900 p-3">
    <p className="text-xs text-zinc-500">
      ZTC Deposited
    </p>

    <p className="mt-1 text-sm font-semibold text-white">
      {formatTokenAmount(
        userPosition.amountADeposited,
        ZTC_DECIMALS
      )}{" "}
      ZTC
    </p>
  </div>

  <div className="rounded-xl bg-zinc-900 p-3">
    <p className="text-xs text-zinc-500">
      WSOL Deposited
    </p>

    <p className="mt-1 text-sm font-semibold text-white">
      {formatTokenAmount(
        userPosition.amountBDeposited,
        WSOL_DECIMALS
      )}{" "}
      WSOL
    </p>
  </div>

</div> 

      <div className="rounded-xl bg-zinc-900 p-3">
  <p className="text-xs text-zinc-500">
    Position PDA
  </p>

  <p className="mt-1 break-all font-mono text-xs text-zinc-400">
    {userPosition.address.toBase58()}
  </p>
</div>

    </div>
  )}

</div>

      {/* ==============================================
          AJOUT DE LIQUIDITÉ
      ============================================== */}

      <div id="add-liquidity-form" className="scroll-mt-24 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 md:p-5 text-white shadow-lg">
  <div className="mb-4">
    <h2 className="text-lg font-bold">
      Ajouter de la liquidité
    </h2>

    <p className="mt-1 text-xs text-zinc-500">
      Indique les montants ZTC et WSOL à ajouter au pool.
    </p>
  </div>

        <div className="mb-3">

  <label className="mb-1.5 block text-xs font-medium text-zinc-400">
    ZTC
  </label>

  <input
    type="number"
    min="0"
    step="0.000001"
    value={ztcAmount}
    onChange={(e) =>
      setZtcAmount(e.target.value)
    }
    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-white outline-none transition focus:border-zinc-600"
  />

</div>

        <div className="mb-4">

  <label className="mb-1.5 block text-xs font-medium text-zinc-400">
    WSOL
  </label>

  <input
    type="number"
    min="0"
    step="0.000000001"
    value={solAmount}
    onChange={(e) =>
      setSolAmount(e.target.value)
    }
    className="w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-white outline-none transition focus:border-zinc-600"
  />

</div>

        <p className="mb-3 text-xs text-zinc-400" role="status">
          {connected
            ? "Wallet Solana connecté. Les soldes ZTC et WSOL seront vérifiés avant l’ajout."
            : "Un wallet Solana doit être connecté. Le bouton ci-dessous permet de le connecter; l’ajout devra ensuite être soumis."}
        </p>

        <button
          type="button"
          onClick={handleAddLiquidity}
          disabled={loading}
          className="w-full rounded-xl bg-white py-3 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
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
          disabled={loading || positionLoading || !userPosition || !publicKey || !userPosition.owner.equals(publicKey)}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Retrait en cours..."
            : positionLoading
            ? "Chargement de la position..."
            : userPosition && publicKey && userPosition.owner.equals(publicKey)
            ? "Retirer toute la liquidité"
            : "Aucune position à retirer"}
        </button>
        {!positionLoading && !userPosition && (
          <p className="mt-3 text-center text-xs text-zinc-500">
            Connecte le wallet qui détient une position ZTC / WSOL pour afficher son retrait.
          </p>
        )}
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
