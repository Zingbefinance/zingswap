BEGIN;

-- A single private row serializes all published refunds against one original.
-- It is derived from the immutable ledger and is not an application balance.
LOCK TABLE public.community_ledger_transactions,
           public.community_ledger_entries
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE community_private.community_ledger_reversal_balances (
  transaction_id uuid PRIMARY KEY
    REFERENCES public.community_ledger_transactions(id) ON DELETE RESTRICT,
  original_amount_minor numeric NOT NULL
    CHECK (original_amount_minor > 0
       AND original_amount_minor = pg_catalog.trunc(original_amount_minor)
       AND original_amount_minor < 1e78),
  reversed_amount_minor numeric NOT NULL DEFAULT 0
    CHECK (reversed_amount_minor >= 0
       AND reversed_amount_minor = pg_catalog.trunc(reversed_amount_minor)
       AND reversed_amount_minor < 1e78
       AND reversed_amount_minor <= original_amount_minor),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE community_private.community_ledger_reversal_balances OWNER TO postgres;
ALTER TABLE community_private.community_ledger_reversal_balances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE community_private.community_ledger_reversal_balances
  FROM PUBLIC, anon, authenticated, service_role;

-- Stop rather than silently accepting any inconsistent historical posting.
DO $preflight$
DECLARE
  v_bad_id uuid;
BEGIN
  SELECT transaction.id INTO v_bad_id
  FROM public.community_ledger_transactions AS transaction
  LEFT JOIN public.community_ledger_entries AS entry
    ON entry.transaction_id = transaction.id
  LEFT JOIN public.community_ledger_accounts AS account
    ON account.id = entry.account_id
  WHERE transaction.status = 'posted'
  GROUP BY transaction.id, transaction.asset_code, transaction.wallet_id
  HAVING pg_catalog.count(entry.id) < 2
      OR pg_catalog.count(DISTINCT entry.account_id) < 2
      OR COALESCE(pg_catalog.sum(entry.amount_minor)
           FILTER (WHERE entry.entry_side = 'debit'), 0) <= 0
      OR COALESCE(pg_catalog.sum(entry.amount_minor)
           FILTER (WHERE entry.entry_side = 'debit'), 0)
         <> COALESCE(pg_catalog.sum(entry.amount_minor)
           FILTER (WHERE entry.entry_side = 'credit'), 0)
      OR COALESCE(pg_catalog.bool_or(
           account.id IS NULL OR account.asset_code <> transaction.asset_code
           OR (account.wallet_id IS NOT NULL
               AND account.wallet_id IS DISTINCT FROM transaction.wallet_id)), false)
  LIMIT 1;
  IF v_bad_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid historical posted ledger transaction: %', v_bad_id
      USING ERRCODE = '23514';
  END IF;

  SELECT transaction.id INTO v_bad_id
  FROM public.community_ledger_transactions AS transaction
  LEFT JOIN public.community_ledger_transactions AS original
    ON original.id = transaction.reverses_transaction_id
  WHERE transaction.status = 'posted'
    AND ((transaction.transaction_kind = 'refund'
          AND (original.id IS NULL OR original.status <> 'posted'
            OR original.reverses_transaction_id IS NOT NULL
            OR original.asset_code <> transaction.asset_code
            OR original.wallet_id IS DISTINCT FROM transaction.wallet_id))
      OR (transaction.transaction_kind <> 'refund'
          AND transaction.reverses_transaction_id IS NOT NULL)
      OR (transaction.transaction_kind = 'refund'
          AND transaction.reverses_transaction_id IS NULL))
  LIMIT 1;
  IF v_bad_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid historical refund relationship: %', v_bad_id
      USING ERRCODE = '23514';
  END IF;
END;
$preflight$;

-- Reconstruct originals and their cumulative posted refund debit totals.
WITH posted_totals AS (
  SELECT transaction.id, transaction.reverses_transaction_id,
         pg_catalog.sum(entry.amount_minor)
           FILTER (WHERE entry.entry_side = 'debit') AS debit_total
  FROM public.community_ledger_transactions AS transaction
  JOIN public.community_ledger_entries AS entry
    ON entry.transaction_id = transaction.id
  WHERE transaction.status = 'posted'
  GROUP BY transaction.id, transaction.reverses_transaction_id
), refund_totals AS (
  SELECT reverses_transaction_id AS transaction_id,
         pg_catalog.sum(debit_total) AS reversed_total
  FROM posted_totals
  WHERE reverses_transaction_id IS NOT NULL
  GROUP BY reverses_transaction_id
)
INSERT INTO community_private.community_ledger_reversal_balances
  (transaction_id, original_amount_minor, reversed_amount_minor)
SELECT original.id, original.debit_total,
       COALESCE(refunds.reversed_total, 0)
FROM posted_totals AS original
LEFT JOIN refund_totals AS refunds ON refunds.transaction_id = original.id
WHERE original.reverses_transaction_id IS NULL;

CREATE OR REPLACE FUNCTION community_private.guard_community_ledger_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_entry_count bigint;
  v_account_count bigint;
  v_debit_sum numeric;
  v_credit_sum numeric;
  v_invalid_entry boolean;
  v_updated_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.posted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Ledger transactions must be inserted as drafts'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Ledger transactions cannot be deleted'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.status <> 'draft'
     OR NEW.status NOT IN ('posted', 'void')
     OR ROW(NEW.id, NEW.operation_id, NEW.wallet_id, NEW.asset_code,
       NEW.transaction_kind, NEW.idempotency_key, NEW.external_reference,
       NEW.reverses_transaction_id, NEW.created_at)
       IS DISTINCT FROM
       ROW(OLD.id, OLD.operation_id, OLD.wallet_id, OLD.asset_code,
       OLD.transaction_kind, OLD.idempotency_key, OLD.external_reference,
       OLD.reverses_transaction_id, OLD.created_at) THEN
    RAISE EXCEPTION 'Only an unchanged draft may transition to posted or void'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status = 'void' THEN
    IF EXISTS (SELECT 1 FROM public.community_ledger_entries AS entry
               WHERE entry.transaction_id = OLD.id) THEN
      RAISE EXCEPTION 'A transaction with entries cannot be voided'
        USING ERRCODE = '23514';
    END IF;
    NEW.posted_at := NULL;
    RETURN NEW;
  END IF;

  IF NEW.posted_at IS NOT NULL THEN
    RAISE EXCEPTION 'posted_at is assigned by the ledger guard'
      USING ERRCODE = '23514';
  END IF;

  IF (NEW.transaction_kind = 'refund' AND NEW.reverses_transaction_id IS NULL)
     OR (NEW.transaction_kind <> 'refund' AND NEW.reverses_transaction_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Only refund transactions may reference an original, and every refund must reference one'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.reverses_transaction_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.community_ledger_transactions AS original
    WHERE original.id = NEW.reverses_transaction_id
      AND original.status = 'posted'
      AND original.reverses_transaction_id IS NULL
      AND original.asset_code = NEW.asset_code
      AND original.wallet_id IS NOT DISTINCT FROM NEW.wallet_id
  ) THEN
    RAISE EXCEPTION 'A refund must reference a posted original for the same wallet and asset; refund chains are forbidden'
      USING ERRCODE = '23514';
  END IF;

  SELECT pg_catalog.count(*), pg_catalog.count(DISTINCT entry.account_id),
    COALESCE(pg_catalog.sum(entry.amount_minor) FILTER (WHERE entry.entry_side = 'debit'), 0),
    COALESCE(pg_catalog.sum(entry.amount_minor) FILTER (WHERE entry.entry_side = 'credit'), 0),
    COALESCE(pg_catalog.bool_or(account.asset_code <> NEW.asset_code
      OR (account.wallet_id IS NOT NULL
          AND account.wallet_id IS DISTINCT FROM NEW.wallet_id)), false)
  INTO v_entry_count, v_account_count, v_debit_sum, v_credit_sum, v_invalid_entry
  FROM public.community_ledger_entries AS entry
  JOIN public.community_ledger_accounts AS account ON account.id = entry.account_id
  WHERE entry.transaction_id = NEW.id;

  IF v_entry_count < 2 OR v_account_count < 2 OR v_debit_sum <= 0
     OR v_credit_sum <= 0 OR v_debit_sum <> v_credit_sum OR v_invalid_entry THEN
    RAISE EXCEPTION 'Posted ledger transaction is unbalanced or has invalid accounts'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.reverses_transaction_id IS NULL THEN
    INSERT INTO community_private.community_ledger_reversal_balances
      (transaction_id, original_amount_minor, reversed_amount_minor)
    VALUES (NEW.id, v_debit_sum, 0);
  ELSE
    UPDATE community_private.community_ledger_reversal_balances AS balance
    SET reversed_amount_minor = balance.reversed_amount_minor + v_debit_sum,
        updated_at = pg_catalog.clock_timestamp()
    WHERE balance.transaction_id = NEW.reverses_transaction_id
      AND balance.reversed_amount_minor + v_debit_sum <= balance.original_amount_minor
    RETURNING balance.transaction_id INTO v_updated_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Refund exceeds the remaining refundable amount or original counter is missing'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.posted_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$function$;

ALTER FUNCTION community_private.guard_community_ledger_transaction() OWNER TO postgres;
REVOKE ALL ON FUNCTION community_private.guard_community_ledger_transaction()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
