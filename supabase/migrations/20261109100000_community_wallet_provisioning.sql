BEGIN;

-- Block auth user inserts until both the existing-user backfill and the
-- signup trigger are installed, so no account can fall between the two.
LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION community_private.provision_community_wallet(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_wallet_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'A user is required to provision a ZinWallet'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.community_wallets (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    SELECT wallet.id INTO STRICT v_wallet_id
    FROM public.community_wallets AS wallet
    WHERE wallet.user_id = p_user_id;
  END IF;

  -- This creates an empty chart-of-accounts row only. It posts no transaction
  -- and creates no ledger entry or credit.
  INSERT INTO public.community_ledger_accounts
    (wallet_id, account_code, account_kind, asset_code)
  VALUES (
    v_wallet_id,
    'zinwallet-available-' || v_wallet_id::text,
    'available',
    'USD_CENT'
  )
  ON CONFLICT (wallet_id, account_kind, asset_code)
    WHERE wallet_id IS NOT NULL
    DO NOTHING;

  IF NOT EXISTS (
    SELECT 1
    FROM public.community_ledger_accounts AS account
    WHERE account.wallet_id = v_wallet_id
      AND account.account_kind = 'available'
      AND account.asset_code = 'USD_CENT'
  ) THEN
    RAISE EXCEPTION 'Could not provision the ZinWallet available account'
      USING ERRCODE = '23514';
  END IF;

  RETURN v_wallet_id;
END;
$function$;

ALTER FUNCTION community_private.provision_community_wallet(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION community_private.provision_community_wallet(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.ensure_community_wallet()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to provision a ZinWallet'
      USING ERRCODE = '28000';
  END IF;

  RETURN community_private.provision_community_wallet(v_user_id);
END;
$function$;

ALTER FUNCTION public.ensure_community_wallet() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.ensure_community_wallet()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_community_wallet() TO authenticated;

CREATE FUNCTION community_private.provision_community_wallet_on_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM community_private.provision_community_wallet(NEW.id);
  RETURN NEW;
END;
$function$;

ALTER FUNCTION community_private.provision_community_wallet_on_signup() OWNER TO postgres;
REVOKE ALL ON FUNCTION community_private.provision_community_wallet_on_signup()
  FROM PUBLIC, anon, authenticated, service_role;

-- Provision existing accounts before attaching the trigger for future users.
DO $backfill$
DECLARE
  v_user_id uuid;
BEGIN
  FOR v_user_id IN SELECT users.id FROM auth.users AS users LOOP
    PERFORM community_private.provision_community_wallet(v_user_id);
  END LOOP;
END;
$backfill$;

DO $backfill_check$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth.users AS users
    LEFT JOIN public.community_wallets AS wallet ON wallet.user_id = users.id
    LEFT JOIN public.community_ledger_accounts AS account
      ON account.wallet_id = wallet.id
     AND account.account_kind = 'available'
     AND account.asset_code = 'USD_CENT'
    WHERE wallet.id IS NULL OR account.id IS NULL
  ) THEN
    RAISE EXCEPTION 'ZinWallet backfill left an auth user without a wallet and available account';
  END IF;
END;
$backfill_check$;

CREATE TRIGGER community_wallets_provision_user
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION community_private.provision_community_wallet_on_signup();

COMMIT;
