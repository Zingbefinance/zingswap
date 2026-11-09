\set ON_ERROR_STOP on

-- Run only against the disposable local zinwallet_test database, as postgres.
-- Requires the ledger foundation and refund-cap migrations to be installed.
BEGIN;

DO $tests$
DECLARE
  v_user uuid := 'b8da5e88-5197-4fa4-9a00-000000000001';
  v_wallet uuid := 'b8da5e88-5197-4fa4-9a00-000000000002';
  v_available uuid := 'b8da5e88-5197-4fa4-9a00-000000000003';
  v_revenue uuid := 'b8da5e88-5197-4fa4-9a00-000000000004';
  v_original uuid := 'b8da5e88-5197-4fa4-9a00-000000000005';
  v_refund uuid;
  v_chain uuid := 'b8da5e88-5197-4fa4-9a00-000000000006';
  v_amount numeric;
  v_error_seen boolean;
  v_ids uuid[] := ARRAY[
    'b8da5e88-5197-4fa4-9a00-000000000007'::uuid,
    'b8da5e88-5197-4fa4-9a00-000000000008'::uuid
  ];
  v_i integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.community_wallets WHERE id = v_wallet)
     OR EXISTS (SELECT 1 FROM public.community_ledger_transactions
                WHERE id IN (v_original, v_chain) OR id = ANY(v_ids)) THEN
    RAISE EXCEPTION 'Fixture UUID collision; choose fresh fixed test UUIDs';
  END IF;

  INSERT INTO auth.users(id) VALUES (v_user);
  INSERT INTO public.community_wallets(id, user_id)
  VALUES (v_wallet, v_user);
  INSERT INTO public.community_ledger_accounts(id, wallet_id, account_code,
    account_kind, asset_code)
  VALUES (v_available, v_wallet, 'test-refund-available-20261108', 'available', 'USD_CENT'),
         (v_revenue, NULL, 'test-refund-revenue-20261108', 'promotion_revenue', 'USD_CENT');

  INSERT INTO public.community_ledger_transactions
    (id, wallet_id, asset_code, transaction_kind, idempotency_key)
  VALUES (v_original, v_wallet, 'USD_CENT', 'promotion_spend', 'test-refund-original-20261108');
  INSERT INTO public.community_ledger_entries(transaction_id, account_id, amount_minor, entry_side)
  VALUES (v_original, v_available, 1000, 'debit'),
         (v_original, v_revenue, 1000, 'credit');
  UPDATE public.community_ledger_transactions SET status = 'posted' WHERE id = v_original;

  -- Partial refund 400, then the remaining 600: both must post.
  FOR v_i IN 1..2 LOOP
    v_amount := CASE v_i WHEN 1 THEN 400 ELSE 600 END;
    v_refund := v_ids[v_i];
    INSERT INTO public.community_ledger_transactions
      (id, wallet_id, asset_code, transaction_kind, idempotency_key, reverses_transaction_id)
    VALUES (v_refund, v_wallet, 'USD_CENT', 'refund',
      'test-refund-part-' || v_i || '-20261108', v_original);
    INSERT INTO public.community_ledger_entries(transaction_id, account_id, amount_minor, entry_side)
    VALUES (v_refund, v_revenue, v_amount, 'debit'),
           (v_refund, v_available, v_amount, 'credit');
    UPDATE public.community_ledger_transactions SET status = 'posted' WHERE id = v_refund;
    IF NOT FOUND THEN RAISE EXCEPTION 'Expected partial refund % to post', v_amount; END IF;
  END LOOP;

  SELECT reversed_amount_minor INTO v_amount
  FROM community_private.community_ledger_reversal_balances
  WHERE transaction_id = v_original;
  IF v_amount <> 1000 THEN RAISE EXCEPTION 'Expected exactly 1000 refunded, got %', v_amount; END IF;

  -- One cent beyond the cap must fail, and the transaction must stay draft.
  v_refund := 'b8da5e88-5197-4fa4-9a00-000000000009';
  INSERT INTO public.community_ledger_transactions
    (id, wallet_id, asset_code, transaction_kind, idempotency_key, reverses_transaction_id)
  VALUES (v_refund, v_wallet, 'USD_CENT', 'refund',
    'test-refund-over-cap-20261108', v_original);
  INSERT INTO public.community_ledger_entries(transaction_id, account_id, amount_minor, entry_side)
  VALUES (v_refund, v_revenue, 1, 'debit'), (v_refund, v_available, 1, 'credit');
  v_error_seen := false;
  BEGIN
    UPDATE public.community_ledger_transactions SET status = 'posted' WHERE id = v_refund;
  EXCEPTION WHEN check_violation THEN v_error_seen := true;
  END;
  IF NOT v_error_seen THEN RAISE EXCEPTION 'One-cent-over refund was accepted'; END IF;
  IF (SELECT status FROM public.community_ledger_transactions WHERE id = v_refund) <> 'draft' THEN
    RAISE EXCEPTION 'Rejected excess refund did not remain draft';
  END IF;

  -- A refund cannot itself be reversed, even if the amount would fit a naive chain.
  INSERT INTO public.community_ledger_transactions
    (id, wallet_id, asset_code, transaction_kind, idempotency_key, reverses_transaction_id)
  VALUES (v_chain, v_wallet, 'USD_CENT', 'refund',
    'test-refund-chain-20261108', v_ids[1]);
  INSERT INTO public.community_ledger_entries(transaction_id, account_id, amount_minor, entry_side)
  VALUES (v_chain, v_available, 1, 'debit'), (v_chain, v_revenue, 1, 'credit');
  v_error_seen := false;
  BEGIN
    UPDATE public.community_ledger_transactions SET status = 'posted' WHERE id = v_chain;
  EXCEPTION WHEN check_violation THEN v_error_seen := true;
  END;
  IF NOT v_error_seen THEN RAISE EXCEPTION 'Refund of refund was accepted'; END IF;

  -- Previously validated protections: posted rows and entries remain immutable.
  v_error_seen := false;
  BEGIN
    UPDATE public.community_ledger_transactions SET status = 'draft' WHERE id = v_original;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_error_seen := true;
  END;
  IF NOT v_error_seen THEN RAISE EXCEPTION 'Posted transaction was mutable'; END IF;

  v_error_seen := false;
  BEGIN
    DELETE FROM public.community_ledger_transactions WHERE id = v_original;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_error_seen := true;
  END;
  IF NOT v_error_seen THEN RAISE EXCEPTION 'Posted transaction was deletable'; END IF;

  v_error_seen := false;
  BEGIN
    UPDATE public.community_ledger_entries SET amount_minor = 999
    WHERE transaction_id = v_original;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_error_seen := true;
  END;
  IF NOT v_error_seen THEN RAISE EXCEPTION 'Posted entry was mutable'; END IF;

  v_error_seen := false;
  BEGIN
    INSERT INTO public.community_ledger_entries(transaction_id, account_id, amount_minor, entry_side)
    VALUES (v_original, v_available, 1, 'debit');
  EXCEPTION WHEN SQLSTATE '55000' THEN v_error_seen := true;
  END;
  IF NOT v_error_seen THEN RAISE EXCEPTION 'Entry was addable after posting'; END IF;

  v_error_seen := false;
  BEGIN
    DELETE FROM public.community_ledger_entries WHERE transaction_id = v_original;
  EXCEPTION WHEN SQLSTATE '55000' THEN v_error_seen := true;
  END;
  IF NOT v_error_seen THEN RAISE EXCEPTION 'Posted entry was deletable'; END IF;

  -- Counter is private to the trusted database owner; application roles get no direct access.
  IF pg_catalog.has_table_privilege('anon',
       'community_private.community_ledger_reversal_balances', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('authenticated',
       'community_private.community_ledger_reversal_balances', 'SELECT,INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege('service_role',
       'community_private.community_ledger_reversal_balances', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Application role unexpectedly has counter-table privileges';
  END IF;
END;
$tests$;

ROLLBACK;

-- The rollback itself is asserted after it has completed.
DO $cleanup_check$
BEGIN
  IF EXISTS (SELECT 1 FROM public.community_wallets
             WHERE id = 'b8da5e88-5197-4fa4-9a00-000000000002')
     OR EXISTS (SELECT 1 FROM public.community_ledger_transactions
                WHERE id BETWEEN 'b8da5e88-5197-4fa4-9a00-000000000005'::uuid
                             AND 'b8da5e88-5197-4fa4-9a00-000000000009'::uuid)
     OR EXISTS (SELECT 1 FROM auth.users
                WHERE id = 'b8da5e88-5197-4fa4-9a00-000000000001') THEN
    RAISE EXCEPTION 'Test fixtures remain after ROLLBACK';
  END IF;
END;
$cleanup_check$;

\echo 'ZinWallet refund-cap local tests passed; fixture transaction rolled back.'
