"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { getCommunityErrorMessage } from "@/lib/community/errors";
import { createClient } from "@/lib/supabase/client";

type WalletTransaction = {
  id: string;
  kind: string;
  amount_minor: string;
  currency: string;
  asset_code: string;
  status: "draft" | "posted" | "void";
  date: string;
  created_at: string;
};

type WalletCursor = { created_at: string; id: string } | null;

type WalletSnapshot = {
  wallet_id: string;
  wallet_status: "active" | "restricted" | "closed";
  currency: string;
  asset_code: string;
  balance_type: "available";
  balance_minor: string;
  history: WalletTransaction[];
  has_more: boolean;
  next_cursor: WalletCursor;
};

type ViewState = "loading" | "signed-out" | "error" | "ready";

function formatMinorUnits(value: string, currency: string) {
  try {
    const amount = BigInt(value);
    const negative = amount < BigInt(0);
    const absolute = negative ? -amount : amount;
    const major = absolute / BigInt(100);
    const minor = String(absolute % BigInt(100)).padStart(2, "0");
    const formattedMajor = new Intl.NumberFormat("fr-FR").format(major);
    const currencyLabel = currency === "USD" ? "$US" : currency;
    return `${negative ? "−" : ""}${formattedMajor},${minor}\u00a0${currencyLabel}`;
  } catch {
    return `— ${currency}`;
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function transactionLabel(kind: string) {
  const labels: Record<string, string> = {
    deposit_credit: "Crédit",
    withdrawal_reserve: "Réservation de retrait",
    withdrawal_settlement: "Retrait",
    withdrawal_release: "Libération de retrait",
    promotion_reserve: "Réservation promotionnelle",
    promotion_spend: "Dépense promotionnelle",
    refund: "Remboursement",
    adjustment: "Ajustement",
  };
  return labels[kind] ?? "Opération ZinWallet";
}

function statusLabel(status: WalletTransaction["status"]) {
  if (status === "posted") return "Validée";
  if (status === "void") return "Annulée";
  return "En attente";
}

function walletStatusLabel(status: WalletSnapshot["wallet_status"]) {
  if (status === "active") return "Actif";
  if (status === "restricted") return "Restreint";
  return "Fermé";
}

export default function WalletDashboard() {
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [snapshot, setSnapshot] = useState<WalletSnapshot | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [pageError, setPageError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadWallet() {
      setViewState("loading");
      setErrorMessage("");
      setPageError("");
      setSnapshot(null);

      try {
        const supabase = createClient();
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (!active) return;
        if (authError) throw authError;
        if (!authData.user) {
          setViewState("signed-out");
          return;
        }

        const { data, error } = await supabase.rpc("get_community_wallet_snapshot", {
          p_limit: 20,
          p_before_created_at: null,
          p_before_id: null,
        });
        if (error) {
          if (error.code === "P0002") {
            throw new Error("Aucun ZinWallet n’est associé à ce compte. Contacte le support Community.");
          }
          throw error;
        }

        if (!active) return;
        setSnapshot(data as unknown as WalletSnapshot);
        setViewState("ready");
      } catch (error) {
        if (!active) return;
        setErrorMessage(error instanceof Error && error.message.startsWith("Aucun ZinWallet")
          ? error.message
          : getCommunityErrorMessage(error, "Le portefeuille est momentanément indisponible"));
        setViewState("error");
      }
    }

    void loadWallet();
    return () => {
      active = false;
    };
  }, [retryCount]);

  const loadMore = useCallback(async () => {
    if (!snapshot?.has_more || !snapshot.next_cursor || loadingMore) return;
    setLoadingMore(true);
    setPageError("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_community_wallet_snapshot", {
        p_limit: 20,
        p_before_created_at: snapshot.next_cursor.created_at,
        p_before_id: snapshot.next_cursor.id,
      });
      if (error) throw error;

      const nextSnapshot = data as unknown as WalletSnapshot;
      setSnapshot((current) => {
        if (!current) return nextSnapshot;
        const knownIds = new Set(current.history.map((transaction) => transaction.id));
        const newTransactions = nextSnapshot.history.filter((transaction) => !knownIds.has(transaction.id));
        return {
          ...nextSnapshot,
          history: [...current.history, ...newTransactions],
        };
      });
    } catch (error) {
      setPageError(getCommunityErrorMessage(error, "Impossible de charger les opérations suivantes"));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, snapshot]);

  if (viewState === "loading") {
    return (
      <section aria-busy="true" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
        <h1 className="text-2xl font-bold">ZinWallet</h1>
        <p className="mt-4 animate-pulse text-sm text-zinc-400">Chargement du portefeuille…</p>
      </section>
    );
  }

  if (viewState === "signed-out") {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
        <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">Community</p>
        <h1 className="mt-2 text-2xl font-bold">ZinWallet</h1>
        <p className="mt-3 text-sm text-zinc-300">Connecte-toi à ton compte Community pour consulter ton portefeuille.</p>
        <Link href="/community/login" className="mt-5 inline-flex rounded-lg bg-cyan-400 px-4 py-2.5 font-semibold text-zinc-950 hover:bg-cyan-300">
          Se connecter
        </Link>
      </section>
    );
  }

  if (viewState === "error" || !snapshot) {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
        <h1 className="text-2xl font-bold">ZinWallet</h1>
        <p role="alert" className="mt-3 text-sm text-amber-200">{errorMessage || "Le portefeuille est momentanément indisponible."}</p>
        <button type="button" onClick={() => setRetryCount((count) => count + 1)} className="mt-5 rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-900">
          Réessayer
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">ZingSwap Community</p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">ZinWallet</h1>
          <p className="mt-2 text-sm text-zinc-400">Solde disponible et opérations comptabilisées.</p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-sm font-medium text-cyan-200">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${snapshot.wallet_status === "active" ? "bg-emerald-400" : "bg-amber-300"}`} />
          Portefeuille {walletStatusLabel(snapshot.wallet_status)}
        </span>
      </header>

      <section aria-label="Solde disponible" className="rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/10 via-zinc-950 to-zinc-950 p-6 sm:p-8">
        <p className="text-sm font-medium text-zinc-400">Solde disponible</p>
        <p className="mt-2 break-words text-3xl font-bold tracking-tight text-white sm:text-4xl">
          {formatMinorUnits(snapshot.balance_minor, snapshot.currency)}
        </p>
        <p className="mt-2 text-xs text-zinc-500">Calculé à partir des écritures validées · {snapshot.currency}</p>
      </section>

      <section aria-labelledby="wallet-history-heading" className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        <div className="border-b border-zinc-800 px-5 py-4 sm:px-6">
          <h2 id="wallet-history-heading" className="text-lg font-semibold">Historique</h2>
          <p className="mt-1 text-sm text-zinc-500">Les opérations les plus récentes apparaissent en premier.</p>
        </div>
        {snapshot.history.length === 0 ? (
          <div className="px-5 py-10 text-center sm:px-6">
            <p className="font-medium text-zinc-200">Aucune opération pour le moment</p>
            <p className="mt-2 text-sm text-zinc-500">Ton historique apparaîtra ici lorsqu’une opération sera enregistrée.</p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {snapshot.history.map((transaction) => (
              <li key={transaction.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="font-medium text-zinc-100">{transactionLabel(transaction.kind)}</p>
                  <p className="mt-1 text-xs text-zinc-500">{formatDate(transaction.date)}</p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300">{statusLabel(transaction.status)}</span>
                  <span className="whitespace-nowrap text-sm font-semibold text-zinc-100">
                    {formatMinorUnits(transaction.amount_minor, transaction.currency)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
        {pageError && <p role="alert" className="px-5 pt-4 text-sm text-amber-200 sm:px-6">{pageError}</p>}
        {snapshot.has_more && (
          <div className="border-t border-zinc-800 px-5 py-4 text-center sm:px-6">
            <button type="button" onClick={() => void loadMore()} disabled={loadingMore} className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-100 transition hover:border-cyan-400/50 hover:text-cyan-200 disabled:cursor-wait disabled:opacity-60">
              {loadingMore ? "Chargement…" : "Voir plus"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
