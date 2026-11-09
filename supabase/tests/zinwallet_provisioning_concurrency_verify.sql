\set ON_ERROR_STOP on

DO $verify$
DECLARE
  v_wallet_count bigint;
  v_account_count bigint;
  v_transaction_count bigint;
  v_entry_count bigint;
BEGIN
  SELECT pg_catalog.count(*) INTO v_wallet_count
  FROM public.community_wallets
  WHERE user_id = 'b8da5e88-5197-4fa4-9a00-000000000903';
  SELECT pg_catalog.count(*) INTO v_account_count
  FROM public.community_ledger_accounts AS account
  JOIN public.community_wallets AS wallet ON wallet.id = account.wallet_id
  WHERE wallet.user_id = 'b8da5e88-5197-4fa4-9a00-000000000903'
    AND account.account_kind = 'available' AND account.asset_code = 'USD_CENT';
  SELECT pg_catalog.count(*) INTO v_transaction_count
  FROM public.community_ledger_transactions AS transaction
  JOIN public.community_wallets AS wallet ON wallet.id = transaction.wallet_id
  WHERE wallet.user_id = 'b8da5e88-5197-4fa4-9a00-000000000903';
  SELECT pg_catalog.count(*) INTO v_entry_count
  FROM public.community_ledger_entries AS entry
  JOIN public.community_ledger_transactions AS transaction
    ON transaction.id = entry.transaction_id
  JOIN public.community_wallets AS wallet ON wallet.id = transaction.wallet_id
  WHERE wallet.user_id = 'b8da5e88-5197-4fa4-9a00-000000000903';

  IF v_wallet_count <> 1 OR v_account_count <> 1
     OR v_transaction_count <> 0 OR v_entry_count <> 0 THEN
    RAISE EXCEPTION 'Expected exactly one empty provisioned wallet; got wallets %, accounts %, transactions %, entries %',
      v_wallet_count, v_account_count, v_transaction_count, v_entry_count;
  END IF;
END;
$verify$;

\echo 'ZinWallet concurrent provisioning test passed.'
