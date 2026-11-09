\set ON_ERROR_STOP on
\set VERBOSITY verbose

-- The caller starts this session's transaction with the requested isolation
-- level via psql -c before loading this file.

-- For contender B this read deliberately establishes its snapshot before it
-- attempts the counter update. Under READ COMMITTED the UPDATE gets a fresh
-- statement snapshot; RR/SERIALIZABLE may instead require a whole-tx retry.
SELECT balance.reversed_amount_minor
FROM public.zinwallet_concurrency_cases AS test_case
JOIN community_private.community_ledger_reversal_balances AS balance
  ON balance.transaction_id = test_case.original_id
WHERE test_case.case_name = :'case_name';

SELECT public.zinwallet_run_refund_contender(
  :'case_name', :'contender', :barrier_key
) AS outcome;

COMMIT;
