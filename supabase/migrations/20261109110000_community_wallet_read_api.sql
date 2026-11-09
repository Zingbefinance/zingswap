BEGIN;

CREATE FUNCTION public.get_community_wallet_snapshot(
  p_limit integer DEFAULT 20,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_wallet_id uuid;
  v_wallet_currency text;
  v_available_account_id uuid;
  v_balance_minor text;
  v_history jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to read a ZinWallet'
      USING ERRCODE = '28000';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION 'Page size must be between 1 and 100'
      USING ERRCODE = '22023';
  END IF;

  IF (p_before_created_at IS NULL) IS DISTINCT FROM (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Both pagination cursor values must be provided together'
      USING ERRCODE = '22023';
  END IF;

  SELECT wallet.id, wallet.currency
  INTO v_wallet_id, v_wallet_currency
  FROM public.community_wallets AS wallet
  WHERE wallet.user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The authenticated user has no provisioned ZinWallet'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT account.id
  INTO v_available_account_id
  FROM public.community_ledger_accounts AS account
  WHERE account.wallet_id = v_wallet_id
    AND account.account_kind = 'available'
    AND account.asset_code = 'USD_CENT';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The ZinWallet available account is missing'
      USING ERRCODE = '55000';
  END IF;

  -- Amounts are returned as decimal strings so clients do not lose precision.
  -- Only posted ledger entries affect the available balance.
  SELECT COALESCE(
    pg_catalog.sum(
      CASE entry.entry_side
        WHEN 'credit' THEN entry.amount_minor
        ELSE -entry.amount_minor
      END
    ), 0
  )::text
  INTO v_balance_minor
  FROM public.community_ledger_entries AS entry
  JOIN public.community_ledger_transactions AS transaction
    ON transaction.id = entry.transaction_id
  WHERE entry.account_id = v_available_account_id
    AND transaction.wallet_id = v_wallet_id
    AND transaction.status = 'posted';

  WITH candidates AS MATERIALIZED (
    SELECT transaction.id,
           transaction.transaction_kind,
           transaction.asset_code,
           transaction.status,
           transaction.created_at,
           transaction.posted_at,
           COALESCE((
             SELECT pg_catalog.sum(entry.amount_minor)
             FROM public.community_ledger_entries AS entry
             WHERE entry.transaction_id = transaction.id
               AND entry.entry_side = 'debit'
           ), 0)::text AS amount_minor
    FROM public.community_ledger_transactions AS transaction
    WHERE transaction.wallet_id = v_wallet_id
      AND (
        p_before_created_at IS NULL
        OR (transaction.created_at, transaction.id)
          < (p_before_created_at, p_before_id)
      )
    ORDER BY transaction.created_at DESC, transaction.id DESC
    LIMIT p_limit + 1
  ), ranked AS (
    SELECT candidates.*,
           pg_catalog.row_number() OVER (
             ORDER BY candidates.created_at DESC, candidates.id DESC
           ) AS page_number
    FROM candidates
  )
  SELECT
    COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', ranked.id,
          'kind', ranked.transaction_kind,
          'amount_minor', ranked.amount_minor,
          'currency', v_wallet_currency,
          'asset_code', ranked.asset_code,
          'status', ranked.status,
          'date', COALESCE(ranked.posted_at, ranked.created_at),
          'created_at', ranked.created_at
        ) ORDER BY ranked.created_at DESC, ranked.id DESC
      ) FILTER (WHERE ranked.page_number <= p_limit),
      '[]'::jsonb
    ),
    COALESCE(pg_catalog.bool_or(ranked.page_number > p_limit), false),
    CASE WHEN pg_catalog.count(*) > p_limit THEN (
      SELECT pg_catalog.jsonb_build_object(
        'created_at', page_row.created_at,
        'id', page_row.id
      )
      FROM ranked AS page_row
      WHERE page_row.page_number = p_limit
    ) ELSE NULL::jsonb END
  INTO v_history, v_has_more, v_next_cursor
  FROM ranked;

  RETURN pg_catalog.jsonb_build_object(
    'wallet_id', v_wallet_id,
    'wallet_status', (SELECT wallet.status
                      FROM public.community_wallets AS wallet
                      WHERE wallet.id = v_wallet_id),
    'currency', v_wallet_currency,
    'asset_code', 'USD_CENT',
    'balance_type', 'available',
    'balance_minor', v_balance_minor,
    'history', v_history,
    'has_more', v_has_more,
    'next_cursor', v_next_cursor
  );
END;
$function$;

ALTER FUNCTION public.get_community_wallet_snapshot(integer, timestamptz, uuid)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_community_wallet_snapshot(integer, timestamptz, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_community_wallet_snapshot(integer, timestamptz, uuid)
  TO authenticated;

COMMIT;
