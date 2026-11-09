\set ON_ERROR_STOP on

-- Run as postgres in the disposable local wallet-read test database.
BEGIN;

DO $fixture_check$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id IN (
       'b8da5e88-5197-4fa4-9a00-000000001001',
       'b8da5e88-5197-4fa4-9a00-000000001002',
       'b8da5e88-5197-4fa4-9a00-000000001003')) THEN
    RAISE EXCEPTION 'Wallet-read test fixture UUID collision';
  END IF;
END;
$fixture_check$;

INSERT INTO auth.users(id) VALUES
  ('b8da5e88-5197-4fa4-9a00-000000001001'),
  ('b8da5e88-5197-4fa4-9a00-000000001002'),
  ('b8da5e88-5197-4fa4-9a00-000000001003');

INSERT INTO public.community_ledger_accounts
  (account_code, account_kind, asset_code)
VALUES ('wallet-read-test-suspense-20261109', 'deposit_suspense', 'USD_CENT');

DO $ledger_fixtures$
DECLARE
  v_wallet_a uuid;
  v_wallet_b uuid;
  v_available_a uuid;
  v_available_b uuid;
  v_suspense uuid;
BEGIN
  SELECT wallet.id INTO STRICT v_wallet_a FROM public.community_wallets AS wallet
  WHERE wallet.user_id = 'b8da5e88-5197-4fa4-9a00-000000001001';
  SELECT wallet.id INTO STRICT v_wallet_b FROM public.community_wallets AS wallet
  WHERE wallet.user_id = 'b8da5e88-5197-4fa4-9a00-000000001002';
  SELECT account.id INTO STRICT v_available_a FROM public.community_ledger_accounts AS account
  WHERE account.wallet_id = v_wallet_a AND account.account_kind = 'available';
  SELECT account.id INTO STRICT v_available_b FROM public.community_ledger_accounts AS account
  WHERE account.wallet_id = v_wallet_b AND account.account_kind = 'available';
  SELECT account.id INTO STRICT v_suspense FROM public.community_ledger_accounts AS account
  WHERE account.account_code = 'wallet-read-test-suspense-20261109';

  INSERT INTO public.community_ledger_transactions
    (id, wallet_id, asset_code, transaction_kind, idempotency_key, created_at)
  VALUES
    ('c1000000-0000-4000-8000-000000001001', v_wallet_a, 'USD_CENT', 'deposit_credit', 'wallet-read-a-1', '2026-11-01 00:00:00+00'),
    ('c1000000-0000-4000-8000-000000001002', v_wallet_a, 'USD_CENT', 'deposit_credit', 'wallet-read-a-2', '2026-11-02 00:00:00+00'),
    ('c1000000-0000-4000-8000-000000001003', v_wallet_a, 'USD_CENT', 'deposit_credit', 'wallet-read-a-3', '2026-11-03 00:00:00+00'),
    ('c1000000-0000-4000-8000-000000001011', v_wallet_b, 'USD_CENT', 'deposit_credit', 'wallet-read-b-1', '2026-11-04 00:00:00+00');

  INSERT INTO public.community_ledger_entries
    (transaction_id, account_id, amount_minor, entry_side)
  VALUES
    ('c1000000-0000-4000-8000-000000001001', v_suspense, 100, 'debit'),
    ('c1000000-0000-4000-8000-000000001001', v_available_a, 100, 'credit'),
    ('c1000000-0000-4000-8000-000000001002', v_suspense, 200, 'debit'),
    ('c1000000-0000-4000-8000-000000001002', v_available_a, 200, 'credit'),
    ('c1000000-0000-4000-8000-000000001003', v_suspense, 300, 'debit'),
    ('c1000000-0000-4000-8000-000000001003', v_available_a, 300, 'credit'),
    ('c1000000-0000-4000-8000-000000001011', v_suspense, 700, 'debit'),
    ('c1000000-0000-4000-8000-000000001011', v_available_b, 700, 'credit');

  UPDATE public.community_ledger_transactions
  SET status = 'posted'
  WHERE id IN (
    'c1000000-0000-4000-8000-000000001001',
    'c1000000-0000-4000-8000-000000001002',
    'c1000000-0000-4000-8000-000000001003',
    'c1000000-0000-4000-8000-000000001011'
  );
END;
$ledger_fixtures$;

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', 'b8da5e88-5197-4fa4-9a00-000000001001', true);
SELECT pg_catalog.set_config(
  'request.jwt.claims', '{"sub":"b8da5e88-5197-4fa4-9a00-000000001001","role":"authenticated"}', true);

DO $read_tests$
DECLARE
  v_page_one jsonb;
  v_page_two jsonb;
  v_page_b jsonb;
  v_empty jsonb;
  v_cursor jsonb;
  v_wallet_a uuid;
  v_wallet_b uuid;
BEGIN
  v_page_one := public.get_community_wallet_snapshot(2, NULL, NULL);
  IF v_page_one->>'balance_minor' <> '600'
     OR v_page_one->>'currency' <> 'USD'
     OR v_page_one->>'asset_code' <> 'USD_CENT'
     OR v_page_one->>'balance_type' <> 'available'
     OR pg_catalog.jsonb_array_length(v_page_one->'history') <> 2
     OR v_page_one->>'has_more' <> 'true' THEN
    RAISE EXCEPTION 'Unexpected first-page wallet snapshot: %', v_page_one;
  END IF;
  IF v_page_one #>> '{history,0,id}' <> 'c1000000-0000-4000-8000-000000001003'
     OR v_page_one #>> '{history,0,amount_minor}' <> '300'
     OR v_page_one #>> '{history,0,status}' <> 'posted'
     OR v_page_one #>> '{history,0,currency}' <> 'USD'
     OR v_page_one #>> '{history,0,asset_code}' <> 'USD_CENT'
     OR v_page_one #>> '{history,0,date}' IS NULL
     OR v_page_one #>> '{history,1,id}' <> 'c1000000-0000-4000-8000-000000001002'
     OR v_page_one #>> '{history,1,amount_minor}' <> '200' THEN
    RAISE EXCEPTION 'History item omitted or misstated required fields: %', v_page_one;
  END IF;

  v_cursor := v_page_one->'next_cursor';
  IF v_cursor->>'id' <> 'c1000000-0000-4000-8000-000000001002'
     OR (v_cursor->>'created_at')::timestamptz <> '2026-11-02 00:00:00+00'::timestamptz THEN
    RAISE EXCEPTION 'Cursor does not point after the last first-page transaction: %', v_cursor;
  END IF;
  v_page_two := public.get_community_wallet_snapshot(
    2,
    (v_cursor->>'created_at')::timestamptz,
    (v_cursor->>'id')::uuid
  );
  IF pg_catalog.jsonb_array_length(v_page_two->'history') <> 1
     OR v_page_two->>'has_more' <> 'false'
     OR v_page_two->'next_cursor' <> 'null'::jsonb
     OR v_page_two #>> '{history,0,id}' <> 'c1000000-0000-4000-8000-000000001001' THEN
    RAISE EXCEPTION 'Unexpected second page or cursor: %', v_page_two;
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(v_page_one->'history') AS first_page(item)
    JOIN pg_catalog.jsonb_array_elements(v_page_two->'history') AS second_page(item)
      ON first_page.item->>'id' = second_page.item->>'id'
  ) THEN
    RAISE EXCEPTION 'History pagination returned a transaction on both pages';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub', 'b8da5e88-5197-4fa4-9a00-000000001002', true);
  PERFORM pg_catalog.set_config(
    'request.jwt.claims', '{"sub":"b8da5e88-5197-4fa4-9a00-000000001002","role":"authenticated"}', true);
  v_page_b := public.get_community_wallet_snapshot(20, NULL, NULL);
  IF v_page_b->>'balance_minor' <> '700'
     OR pg_catalog.jsonb_array_length(v_page_b->'history') <> 1
     OR v_page_b #>> '{history,0,id}' <> 'c1000000-0000-4000-8000-000000001011'
     OR v_page_b->>'wallet_id' = v_page_one->>'wallet_id'
     OR v_page_b->'history' @> pg_catalog.jsonb_build_array(
       pg_catalog.jsonb_build_object('id', 'c1000000-0000-4000-8000-000000001003')) THEN
    RAISE EXCEPTION 'User B received incorrect or foreign wallet data: %', v_page_b;
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub', 'b8da5e88-5197-4fa4-9a00-000000001003', true);
  PERFORM pg_catalog.set_config(
    'request.jwt.claims', '{"sub":"b8da5e88-5197-4fa4-9a00-000000001003","role":"authenticated"}', true);
  v_empty := public.get_community_wallet_snapshot(20, NULL, NULL);
  IF v_empty->>'balance_minor' <> '0'
     OR pg_catalog.jsonb_array_length(v_empty->'history') <> 0
     OR v_empty->>'has_more' <> 'false' THEN
    RAISE EXCEPTION 'Empty wallet should return zero and an empty history: %', v_empty;
  END IF;

  v_wallet_a := (v_page_one->>'wallet_id')::uuid;
  v_wallet_b := (v_page_b->>'wallet_id')::uuid;
  IF v_wallet_a = v_wallet_b THEN
    RAISE EXCEPTION 'Distinct users resolved to the same wallet';
  END IF;

  BEGIN
    PERFORM public.get_community_wallet_snapshot(0, NULL, NULL);
    RAISE EXCEPTION 'Invalid page size unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '{}', true);
  BEGIN
    PERFORM public.get_community_wallet_snapshot(20, NULL, NULL);
    RAISE EXCEPTION 'Unauthenticated wallet read unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '28000' THEN
    NULL;
  END;
END;
$read_tests$;

RESET ROLE;
SET LOCAL ROLE anon;

DO $anonymous_test$
BEGIN
  BEGIN
    PERFORM public.get_community_wallet_snapshot(20, NULL, NULL);
    RAISE EXCEPTION 'Anonymous wallet read unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$anonymous_test$;

RESET ROLE;

DO $permission_tests$
BEGIN
  IF NOT pg_catalog.has_function_privilege(
       'authenticated', 'public.get_community_wallet_snapshot(integer,timestamp with time zone,uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'anon', 'public.get_community_wallet_snapshot(integer,timestamp with time zone,uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'service_role', 'public.get_community_wallet_snapshot(integer,timestamp with time zone,uuid)', 'EXECUTE')
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.community_ledger_transactions', 'SELECT')
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.community_ledger_entries', 'SELECT') THEN
    RAISE EXCEPTION 'Wallet read privileges are broader than intended';
  END IF;
END;
$permission_tests$;

ROLLBACK;

DO $rollback_check$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id IN (
       'b8da5e88-5197-4fa4-9a00-000000001001',
       'b8da5e88-5197-4fa4-9a00-000000001002',
       'b8da5e88-5197-4fa4-9a00-000000001003'))
     OR EXISTS (SELECT 1 FROM public.community_ledger_transactions WHERE id BETWEEN
       'c1000000-0000-4000-8000-000000001001'::uuid AND
       'c1000000-0000-4000-8000-000000001011'::uuid) THEN
    RAISE EXCEPTION 'Wallet-read test fixtures remain after rollback';
  END IF;
END;
$rollback_check$;

\echo 'ZinWallet secure wallet-read tests passed.'
