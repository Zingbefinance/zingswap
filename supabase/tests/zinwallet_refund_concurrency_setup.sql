\set ON_ERROR_STOP on

-- Run only in the disposable clone zinwallet_refund_concurrency_test.
CREATE TABLE public.zinwallet_concurrency_results (
  case_name text NOT NULL,
  contender text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('posted', 'cap_rejected', 'serialization_retry')),
  sqlstate text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (case_name, contender)
);

CREATE TABLE public.zinwallet_concurrency_cases (
  case_name text PRIMARY KEY,
  wallet_id uuid NOT NULL REFERENCES public.community_wallets(id),
  original_id uuid NOT NULL REFERENCES public.community_ledger_transactions(id)
);

CREATE FUNCTION public.zinwallet_run_refund_contender(
  p_case text, p_contender text, p_barrier_key bigint
) RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_available uuid;
  v_revenue uuid;
  v_wallet_id uuid;
  v_original_id uuid;
  v_refund_id uuid := pg_catalog.gen_random_uuid();
  v_error_message text;
BEGIN
  SELECT wallet_id, original_id INTO STRICT v_wallet_id, v_original_id
  FROM public.zinwallet_concurrency_cases WHERE case_name = p_case;
  SELECT id INTO STRICT v_available
  FROM public.community_ledger_accounts
  WHERE wallet_id = v_wallet_id AND account_kind = 'available';
  SELECT id INTO STRICT v_revenue
  FROM public.community_ledger_accounts
  WHERE wallet_id IS NULL AND account_kind = 'promotion_revenue'
    AND asset_code = 'USD_CENT';

  INSERT INTO public.community_ledger_transactions
    (id, wallet_id, asset_code, transaction_kind, idempotency_key,
     reverses_transaction_id)
  VALUES (v_refund_id, v_wallet_id, 'USD_CENT', 'refund',
    'concurrency-' || p_case || '-' || p_contender, v_original_id);
  INSERT INTO public.community_ledger_entries
    (transaction_id, account_id, amount_minor, entry_side)
  VALUES (v_refund_id, v_revenue, 600, 'debit'),
         (v_refund_id, v_available, 600, 'credit');

  UPDATE public.community_ledger_transactions
  SET status = 'posted' WHERE id = v_refund_id;
  INSERT INTO public.zinwallet_concurrency_results(case_name, contender, outcome)
  VALUES (p_case, p_contender, 'posted');

  -- A waits here while still holding the transaction's counter-row lock.
  -- The PowerShell controller releases this advisory barrier only after it
  -- observes B blocked by A in pg_blocking_pids().
  IF p_barrier_key <> 0 THEN
    PERFORM pg_catalog.pg_advisory_lock(p_barrier_key);
    PERFORM pg_catalog.pg_advisory_unlock(p_barrier_key);
  END IF;
  RETURN 'posted';
EXCEPTION
  WHEN check_violation THEN
    GET STACKED DIAGNOSTICS v_error_message = MESSAGE_TEXT;
    IF v_error_message NOT LIKE 'Refund exceeds the remaining refundable amount%' THEN
      RAISE;
    END IF;
    INSERT INTO public.zinwallet_concurrency_results(case_name, contender, outcome, sqlstate)
    VALUES (p_case, p_contender, 'cap_rejected', '23514');
    RETURN 'cap_rejected';
  WHEN serialization_failure THEN
    INSERT INTO public.zinwallet_concurrency_results(case_name, contender, outcome, sqlstate)
    VALUES (p_case, p_contender, 'serialization_retry', '40001');
    RETURN 'serialization_retry';
END;
$function$;

-- Each isolation case has a separate original and counter row.
INSERT INTO auth.users(id) VALUES
 ('b8da5e88-5197-4fa4-9a00-000000000101'),
 ('b8da5e88-5197-4fa4-9a00-000000000102'),
 ('b8da5e88-5197-4fa4-9a00-000000000103');

INSERT INTO public.community_wallets(id, user_id) VALUES
 ('b8da5e88-5197-4fa4-9a00-000000000111', 'b8da5e88-5197-4fa4-9a00-000000000101'),
 ('b8da5e88-5197-4fa4-9a00-000000000112', 'b8da5e88-5197-4fa4-9a00-000000000102'),
 ('b8da5e88-5197-4fa4-9a00-000000000113', 'b8da5e88-5197-4fa4-9a00-000000000103');

INSERT INTO public.community_ledger_accounts(id, wallet_id, account_code, account_kind, asset_code) VALUES
 ('b8da5e88-5197-4fa4-9a00-000000000121', 'b8da5e88-5197-4fa4-9a00-000000000111', 'cc-rc-available', 'available', 'USD_CENT'),
 ('b8da5e88-5197-4fa4-9a00-000000000122', 'b8da5e88-5197-4fa4-9a00-000000000112', 'cc-rr-available', 'available', 'USD_CENT'),
 ('b8da5e88-5197-4fa4-9a00-000000000123', 'b8da5e88-5197-4fa4-9a00-000000000113', 'cc-sr-available', 'available', 'USD_CENT'),
 ('b8da5e88-5197-4fa4-9a00-000000000124', NULL, 'cc-system-revenue', 'promotion_revenue', 'USD_CENT');

INSERT INTO public.community_ledger_transactions
  (id, wallet_id, asset_code, transaction_kind, idempotency_key) VALUES
 ('b8da5e88-5197-4fa4-9a00-000000000131', 'b8da5e88-5197-4fa4-9a00-000000000111', 'USD_CENT', 'promotion_spend', 'cc-original-rc'),
 ('b8da5e88-5197-4fa4-9a00-000000000132', 'b8da5e88-5197-4fa4-9a00-000000000112', 'USD_CENT', 'promotion_spend', 'cc-original-rr'),
 ('b8da5e88-5197-4fa4-9a00-000000000133', 'b8da5e88-5197-4fa4-9a00-000000000113', 'USD_CENT', 'promotion_spend', 'cc-original-sr');

INSERT INTO public.community_ledger_entries(transaction_id, account_id, amount_minor, entry_side) VALUES
 ('b8da5e88-5197-4fa4-9a00-000000000131', 'b8da5e88-5197-4fa4-9a00-000000000121', 1000, 'debit'),
 ('b8da5e88-5197-4fa4-9a00-000000000131', 'b8da5e88-5197-4fa4-9a00-000000000124', 1000, 'credit'),
 ('b8da5e88-5197-4fa4-9a00-000000000132', 'b8da5e88-5197-4fa4-9a00-000000000122', 1000, 'debit'),
 ('b8da5e88-5197-4fa4-9a00-000000000132', 'b8da5e88-5197-4fa4-9a00-000000000124', 1000, 'credit'),
 ('b8da5e88-5197-4fa4-9a00-000000000133', 'b8da5e88-5197-4fa4-9a00-000000000123', 1000, 'debit'),
 ('b8da5e88-5197-4fa4-9a00-000000000133', 'b8da5e88-5197-4fa4-9a00-000000000124', 1000, 'credit');

UPDATE public.community_ledger_transactions SET status = 'posted'
WHERE id IN ('b8da5e88-5197-4fa4-9a00-000000000131',
             'b8da5e88-5197-4fa4-9a00-000000000132',
             'b8da5e88-5197-4fa4-9a00-000000000133');

INSERT INTO public.zinwallet_concurrency_cases(case_name, wallet_id, original_id) VALUES
 ('rc', 'b8da5e88-5197-4fa4-9a00-000000000111', 'b8da5e88-5197-4fa4-9a00-000000000131'),
 ('rr', 'b8da5e88-5197-4fa4-9a00-000000000112', 'b8da5e88-5197-4fa4-9a00-000000000132'),
 ('sr', 'b8da5e88-5197-4fa4-9a00-000000000113', 'b8da5e88-5197-4fa4-9a00-000000000133');

\echo 'Concurrency fixtures ready.'
