\set ON_ERROR_STOP on

-- Run as postgres in the disposable local provisioning test database.
BEGIN;

DO $fixture_check$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users
             WHERE id IN (
               'b8da5e88-5197-4fa4-9a00-000000000901',
               'b8da5e88-5197-4fa4-9a00-000000000902'
             )) THEN
    RAISE EXCEPTION 'Provisioning test fixture UUID collision';
  END IF;
END;
$fixture_check$;

-- The auth trigger should provision both new users, with no ledger credits.
INSERT INTO auth.users(id) VALUES
  ('b8da5e88-5197-4fa4-9a00-000000000901'),
  ('b8da5e88-5197-4fa4-9a00-000000000902');

SET LOCAL ROLE authenticated;
SELECT pg_catalog.set_config(
  'request.jwt.claim.sub', 'b8da5e88-5197-4fa4-9a00-000000000901', true);
SELECT pg_catalog.set_config(
  'request.jwt.claims', '{"sub":"b8da5e88-5197-4fa4-9a00-000000000901","role":"authenticated"}', true);

DO $authenticated_tests$
DECLARE
  v_first uuid;
  v_second uuid;
  v_other uuid;
BEGIN
  v_first := public.ensure_community_wallet();
  v_second := public.ensure_community_wallet();
  IF v_first IS DISTINCT FROM v_second THEN
    RAISE EXCEPTION 'Repeated provisioning returned different wallets';
  END IF;

  PERFORM pg_catalog.set_config(
    'request.jwt.claim.sub', 'b8da5e88-5197-4fa4-9a00-000000000902', true);
  PERFORM pg_catalog.set_config(
    'request.jwt.claims', '{"sub":"b8da5e88-5197-4fa4-9a00-000000000902","role":"authenticated"}', true);
  v_other := public.ensure_community_wallet();
  IF v_other = v_first THEN
    RAISE EXCEPTION 'Different authenticated users received the same wallet';
  END IF;

  PERFORM pg_catalog.set_config('request.jwt.claim.sub', '', true);
  PERFORM pg_catalog.set_config('request.jwt.claims', '{}', true);
  BEGIN
    PERFORM public.ensure_community_wallet();
    RAISE EXCEPTION 'Unauthenticated provisioning unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '28000' THEN
    NULL;
  END;
END;
$authenticated_tests$;

RESET ROLE;

DO $integrity_tests$
DECLARE
  v_wallet_count bigint;
  v_account_count bigint;
  v_transaction_count bigint;
  v_entry_count bigint;
BEGIN
  SELECT pg_catalog.count(*) INTO v_wallet_count
  FROM public.community_wallets
  WHERE user_id IN (
    'b8da5e88-5197-4fa4-9a00-000000000901',
    'b8da5e88-5197-4fa4-9a00-000000000902'
  );
  IF v_wallet_count <> 2 THEN
    RAISE EXCEPTION 'Expected one wallet per test user; got %', v_wallet_count;
  END IF;

  SELECT pg_catalog.count(*) INTO v_account_count
  FROM public.community_ledger_accounts AS account
  JOIN public.community_wallets AS wallet ON wallet.id = account.wallet_id
  WHERE wallet.user_id IN (
    'b8da5e88-5197-4fa4-9a00-000000000901',
    'b8da5e88-5197-4fa4-9a00-000000000902'
  ) AND account.account_kind = 'available' AND account.asset_code = 'USD_CENT';
  IF v_account_count <> 2 THEN
    RAISE EXCEPTION 'Expected one available account per wallet; got %', v_account_count;
  END IF;

  SELECT pg_catalog.count(*) INTO v_transaction_count
  FROM public.community_ledger_transactions AS transaction
  JOIN public.community_wallets AS wallet ON wallet.id = transaction.wallet_id
  WHERE wallet.user_id IN (
    'b8da5e88-5197-4fa4-9a00-000000000901',
    'b8da5e88-5197-4fa4-9a00-000000000902'
  );
  SELECT pg_catalog.count(*) INTO v_entry_count
  FROM public.community_ledger_entries AS entry
  JOIN public.community_ledger_transactions AS transaction
    ON transaction.id = entry.transaction_id
  JOIN public.community_wallets AS wallet ON wallet.id = transaction.wallet_id
  WHERE wallet.user_id IN (
    'b8da5e88-5197-4fa4-9a00-000000000901',
    'b8da5e88-5197-4fa4-9a00-000000000902'
  );
  IF v_transaction_count <> 0 OR v_entry_count <> 0 THEN
    RAISE EXCEPTION 'Provisioning created ledger transactions or entries';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
       'authenticated', 'public.ensure_community_wallet()', 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'anon', 'public.ensure_community_wallet()', 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'service_role', 'public.ensure_community_wallet()', 'EXECUTE')
     OR pg_catalog.has_function_privilege(
       'authenticated', 'community_private.provision_community_wallet(uuid)', 'EXECUTE')
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.community_wallets', 'INSERT,UPDATE,DELETE')
     OR pg_catalog.has_table_privilege(
       'authenticated', 'public.community_ledger_accounts', 'INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'Unexpected wallet provisioning or table privileges';
  END IF;
END;
$integrity_tests$;

ROLLBACK;

DO $rollback_check$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users WHERE id IN (
       'b8da5e88-5197-4fa4-9a00-000000000901',
       'b8da5e88-5197-4fa4-9a00-000000000902'))
     OR EXISTS (SELECT 1 FROM public.community_wallets WHERE user_id IN (
       'b8da5e88-5197-4fa4-9a00-000000000901',
       'b8da5e88-5197-4fa4-9a00-000000000902')) THEN
    RAISE EXCEPTION 'Provisioning SQL test left fixture rows after rollback';
  END IF;
END;
$rollback_check$;

\echo 'ZinWallet provisioning idempotency/security tests passed.'
