\set ON_ERROR_STOP on

DO $verify$
DECLARE
  v_case text;
  v_outcomes integer;
  v_winners integer;
  v_refunded numeric;
  v_posted_refunds integer;
  v_posted_refund_minor numeric;
  v_loser_count integer;
  v_invalid_losers integer;
BEGIN
  FOREACH v_case IN ARRAY ARRAY['rc', 'rr', 'sr'] LOOP
    SELECT count(*), count(*) FILTER (WHERE outcome = 'posted')
    INTO v_outcomes, v_winners
    FROM public.zinwallet_concurrency_results
    WHERE case_name = v_case;
    IF v_outcomes <> 2 OR v_winners <> 1 THEN
      RAISE EXCEPTION 'Case % expected two outcomes and one winner; got %, %',
        v_case, v_outcomes, v_winners;
    END IF;
    SELECT count(*) FILTER (WHERE outcome <> 'posted'),
           count(*) FILTER (WHERE outcome NOT IN ('posted', 'cap_rejected', 'serialization_retry')
             OR (outcome = 'cap_rejected' AND sqlstate <> '23514')
             OR (outcome = 'serialization_retry' AND sqlstate <> '40001'))
    INTO v_loser_count, v_invalid_losers
    FROM public.zinwallet_concurrency_results
    WHERE case_name = v_case;
    IF v_loser_count <> 1 OR v_invalid_losers <> 0 THEN
      RAISE EXCEPTION 'Case % must have one valid cap/serialization loser; loser count %, invalid count %',
        v_case, v_loser_count, v_invalid_losers;
    END IF;

    SELECT balance.reversed_amount_minor, count(refund.id)
    INTO v_refunded, v_posted_refunds
    FROM public.zinwallet_concurrency_cases AS test_case
    JOIN community_private.community_ledger_reversal_balances AS balance
      ON balance.transaction_id = test_case.original_id
    LEFT JOIN public.community_ledger_transactions AS refund
      ON refund.reverses_transaction_id = test_case.original_id
     AND refund.status = 'posted'
    WHERE test_case.case_name = v_case
    GROUP BY balance.reversed_amount_minor;
    SELECT COALESCE(sum(entry.amount_minor), 0)
    INTO v_posted_refund_minor
    FROM public.zinwallet_concurrency_cases AS test_case
    JOIN public.community_ledger_transactions AS refund
      ON refund.reverses_transaction_id = test_case.original_id
     AND refund.status = 'posted'
    JOIN public.community_ledger_entries AS entry
      ON entry.transaction_id = refund.id AND entry.entry_side = 'credit'
    WHERE test_case.case_name = v_case;
    IF v_refunded <> 600 OR v_posted_refunds <> 1 OR v_posted_refund_minor <> 600 THEN
      RAISE EXCEPTION 'Case % expected one posted 600 refund and counter 600; got counter %, refunds %, posted credit %',
        v_case, v_refunded, v_posted_refunds, v_posted_refund_minor;
    END IF;
  END LOOP;
END;
$verify$;

TABLE public.zinwallet_concurrency_results;
\echo 'Concurrency verification passed: one 600-cent refund per case; each counter is 600.'
