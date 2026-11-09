BEGIN;

-- ZinWallet accounting foundation. Balances are derived from the
-- immutable posted ledger; this migration creates no wallet/account seeds and
-- no callable credit, debit, deposit, withdrawal, or promotion operation.

CREATE TABLE public.community_wallets (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE
    REFERENCES auth.users (id) ON DELETE RESTRICT,
  currency text NOT NULL DEFAULT 'USD'
    CONSTRAINT community_wallets_currency_check CHECK (currency = 'USD'),
  status text NOT NULL DEFAULT 'active'
    CONSTRAINT community_wallets_status_check
      CHECK (status IN ('active', 'restricted', 'closed')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE TABLE public.community_ledger_accounts (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  wallet_id uuid NULL
    REFERENCES public.community_wallets (id) ON DELETE RESTRICT,
  account_code text NOT NULL UNIQUE,
  account_kind text NOT NULL
    CONSTRAINT community_ledger_accounts_kind_check CHECK (
      account_kind IN (
        'available',
        'withdrawal_reserved',
        'promotion_reserved',
        'crypto_custody',
        'deposit_suspense',
        'payout_clearing',
        'promotion_revenue',
        'network_fees',
        'fx_clearing',
        'operational_loss'
      )
    ),
  asset_code text NOT NULL
    CONSTRAINT community_ledger_accounts_asset_check
      CHECK (asset_code ~ '^[A-Za-z0-9:_-]{3,160}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT community_ledger_accounts_wallet_scope_check CHECK (
    (account_kind IN ('available', 'withdrawal_reserved', 'promotion_reserved')
      AND wallet_id IS NOT NULL AND asset_code = 'USD_CENT')
    OR
    (account_kind IN (
      'crypto_custody', 'deposit_suspense', 'payout_clearing',
      'promotion_revenue', 'network_fees', 'fx_clearing', 'operational_loss'
    ) AND wallet_id IS NULL)
  )
);

CREATE INDEX community_ledger_accounts_wallet_kind_idx
  ON public.community_ledger_accounts (wallet_id, account_kind)
  WHERE wallet_id IS NOT NULL;
CREATE UNIQUE INDEX community_ledger_accounts_wallet_kind_asset_uidx
  ON public.community_ledger_accounts (wallet_id, account_kind, asset_code)
  WHERE wallet_id IS NOT NULL;
CREATE INDEX community_ledger_accounts_system_asset_idx
  ON public.community_ledger_accounts (account_kind, asset_code)
  WHERE wallet_id IS NULL;

CREATE TABLE public.community_ledger_transactions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  operation_id uuid NOT NULL DEFAULT pg_catalog.gen_random_uuid(),
  wallet_id uuid NULL
    REFERENCES public.community_wallets (id) ON DELETE RESTRICT,
  asset_code text NOT NULL
    CONSTRAINT community_ledger_transactions_asset_check
      CHECK (asset_code ~ '^[A-Za-z0-9:_-]{3,160}$'),
  transaction_kind text NOT NULL
    CONSTRAINT community_ledger_transactions_kind_check CHECK (
      transaction_kind IN (
        'deposit_credit', 'withdrawal_reserve', 'withdrawal_settlement',
        'withdrawal_release', 'promotion_reserve', 'promotion_spend',
        'refund', 'adjustment'
      )
    ),
  idempotency_key text NOT NULL UNIQUE
    CONSTRAINT community_ledger_transactions_idempotency_check
      CHECK (pg_catalog.length(idempotency_key) BETWEEN 1 AND 200),
  -- A reference alone is not a canonical deposit identity. Future deposit
  -- records/functions must uniquely bind network, tx hash/signature, and the
  -- event/log/output index where a transaction can contain multiple payments.
  external_reference text NULL,
  -- Multiple partial compensations are allowed. Future financial functions
  -- must serialize on the original and cap cumulative posted reversals at its
  -- refundable amount; this FK alone does not enforce that limit.
  reverses_transaction_id uuid NULL
    REFERENCES public.community_ledger_transactions (id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft'
    CONSTRAINT community_ledger_transactions_status_check
      CHECK (status IN ('draft', 'posted', 'void')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  posted_at timestamptz NULL,
  CONSTRAINT community_ledger_transactions_wallet_check CHECK (
    transaction_kind = 'adjustment' OR wallet_id IS NOT NULL
  ),
  CONSTRAINT community_ledger_transactions_not_self_reversal_check CHECK (
    reverses_transaction_id IS NULL OR reverses_transaction_id <> id
  ),
  CONSTRAINT community_ledger_transactions_posted_at_check CHECK (
    (status = 'posted' AND posted_at IS NOT NULL)
    OR (status <> 'posted' AND posted_at IS NULL)
  )
);

CREATE INDEX community_ledger_transactions_operation_idx
  ON public.community_ledger_transactions (operation_id);
CREATE INDEX community_ledger_transactions_wallet_created_idx
  ON public.community_ledger_transactions (wallet_id, created_at DESC)
  WHERE wallet_id IS NOT NULL;
CREATE INDEX community_ledger_transactions_status_created_idx
  ON public.community_ledger_transactions (status, created_at);
CREATE INDEX community_ledger_transactions_external_reference_idx
  ON public.community_ledger_transactions (external_reference)
  WHERE external_reference IS NOT NULL;
CREATE INDEX community_ledger_transactions_reverses_idx
  ON public.community_ledger_transactions (reverses_transaction_id)
  WHERE reverses_transaction_id IS NOT NULL;

CREATE TABLE public.community_ledger_entries (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  transaction_id uuid NOT NULL
    REFERENCES public.community_ledger_transactions (id) ON DELETE RESTRICT,
  account_id uuid NOT NULL
    REFERENCES public.community_ledger_accounts (id) ON DELETE RESTRICT,
  -- Exact positive integer in the transaction asset's smallest accounting
  -- unit; direction is recorded separately. No scale typmod is used, so
  -- fractional input is rejected instead of being rounded on assignment.
  amount_minor numeric NOT NULL
    CONSTRAINT community_ledger_entries_amount_check CHECK (
      amount_minor > 0
      AND amount_minor = pg_catalog.trunc(amount_minor)
      AND amount_minor < 1e78
    ),
  entry_side text NOT NULL
    CONSTRAINT community_ledger_entries_side_check
      CHECK (entry_side IN ('debit', 'credit')),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX community_ledger_entries_transaction_idx
  ON public.community_ledger_entries (transaction_id);
CREATE INDEX community_ledger_entries_account_created_idx
  ON public.community_ledger_entries (account_id, created_at DESC);

-- Prevent direct mutation of the chart of accounts. Future chart changes must
-- be additive and auditable rather than rewriting account identity or scope.
CREATE FUNCTION community_private.guard_community_ledger_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Community ledger accounts are immutable'
    USING ERRCODE = '55000';
END;
$function$;

CREATE FUNCTION community_private.guard_community_ledger_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'ZinWallet accounting tables cannot be truncated'
    USING ERRCODE = '55000';
END;
$function$;

CREATE TRIGGER community_ledger_accounts_immutable
BEFORE UPDATE OR DELETE ON public.community_ledger_accounts
FOR EACH ROW EXECUTE FUNCTION community_private.guard_community_ledger_account();
ALTER TABLE public.community_ledger_accounts
  ENABLE ALWAYS TRIGGER community_ledger_accounts_immutable;

-- A draft can be posted once, only after its entries balance exactly by asset.
-- Posted and void transactions cannot subsequently be changed or deleted.
CREATE FUNCTION community_private.guard_community_ledger_transaction()
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
     OR ROW(
       NEW.id, NEW.operation_id, NEW.wallet_id, NEW.asset_code,
       NEW.transaction_kind, NEW.idempotency_key, NEW.external_reference,
       NEW.reverses_transaction_id, NEW.created_at
     ) IS DISTINCT FROM ROW(
       OLD.id, OLD.operation_id, OLD.wallet_id, OLD.asset_code,
       OLD.transaction_kind, OLD.idempotency_key, OLD.external_reference,
       OLD.reverses_transaction_id, OLD.created_at
     ) THEN
    RAISE EXCEPTION 'Only an unchanged draft may transition to posted or void'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status = 'void' THEN
    IF EXISTS (
      SELECT 1
      FROM public.community_ledger_entries AS entry
      WHERE entry.transaction_id = OLD.id
    ) THEN
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

  IF NEW.reverses_transaction_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.community_ledger_transactions AS original
    WHERE original.id = NEW.reverses_transaction_id
      AND original.status = 'posted'
      AND original.asset_code = NEW.asset_code
      AND original.wallet_id IS NOT DISTINCT FROM NEW.wallet_id
  ) THEN
    RAISE EXCEPTION 'A compensation must reference a posted transaction for the same wallet and asset'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    pg_catalog.count(*),
    pg_catalog.count(DISTINCT entry.account_id),
    COALESCE(pg_catalog.sum(entry.amount_minor)
      FILTER (WHERE entry.entry_side = 'debit'), 0),
    COALESCE(pg_catalog.sum(entry.amount_minor)
      FILTER (WHERE entry.entry_side = 'credit'), 0),
    COALESCE(pg_catalog.bool_or(
      account.asset_code <> NEW.asset_code
      OR (account.wallet_id IS NOT NULL
        AND account.wallet_id IS DISTINCT FROM NEW.wallet_id)
    ), false)
  INTO v_entry_count, v_account_count, v_debit_sum,
       v_credit_sum, v_invalid_entry
  FROM public.community_ledger_entries AS entry
  JOIN public.community_ledger_accounts AS account
    ON account.id = entry.account_id
  WHERE entry.transaction_id = NEW.id;

  IF v_entry_count < 2 OR v_account_count < 2
     OR v_debit_sum <= 0 OR v_credit_sum <= 0
     OR v_debit_sum <> v_credit_sum
     OR v_invalid_entry THEN
    RAISE EXCEPTION 'Posted ledger transaction is unbalanced or has invalid accounts'
      USING ERRCODE = '23514';
  END IF;

  NEW.posted_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER community_ledger_transactions_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.community_ledger_transactions
FOR EACH ROW EXECUTE FUNCTION community_private.guard_community_ledger_transaction();
ALTER TABLE public.community_ledger_transactions
  ENABLE ALWAYS TRIGGER community_ledger_transactions_guard;

-- Lock the parent transaction before touching entries. This serializes entry
-- changes against the draft -> posted transition and blocks later edits.
CREATE FUNCTION community_private.guard_community_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_transaction_id uuid;
  v_transaction_status text;
  v_transaction_wallet_id uuid;
  v_transaction_asset_code text;
  v_account_wallet_id uuid;
  v_account_asset_code text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.transaction_id <> OLD.transaction_id THEN
    RAISE EXCEPTION 'Ledger entries cannot be moved between transactions'
      USING ERRCODE = '55000';
  END IF;

  v_transaction_id := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.transaction_id ELSE NEW.transaction_id END;

  SELECT transaction.status, transaction.wallet_id, transaction.asset_code
  INTO v_transaction_status, v_transaction_wallet_id, v_transaction_asset_code
  FROM public.community_ledger_transactions AS transaction
  WHERE transaction.id = v_transaction_id
  FOR UPDATE;

  IF NOT FOUND OR v_transaction_status <> 'draft' THEN
    RAISE EXCEPTION 'Entries may only be changed while their transaction is a draft'
      USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT account.wallet_id, account.asset_code
  INTO v_account_wallet_id, v_account_asset_code
  FROM public.community_ledger_accounts AS account
  WHERE account.id = NEW.account_id;

  IF NOT FOUND OR v_account_asset_code <> v_transaction_asset_code
     OR (v_account_wallet_id IS NOT NULL
       AND v_account_wallet_id IS DISTINCT FROM v_transaction_wallet_id) THEN
    RAISE EXCEPTION 'Ledger entry account does not match transaction asset or wallet'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER community_ledger_entries_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.community_ledger_entries
FOR EACH ROW EXECUTE FUNCTION community_private.guard_community_ledger_entry();
ALTER TABLE public.community_ledger_entries
  ENABLE ALWAYS TRIGGER community_ledger_entries_guard;

-- Row triggers do not run for TRUNCATE. These guards block it for ordinary
-- owners/operators; a superuser or sufficiently privileged administrator can
-- still disable triggers or alter/drop the tables by design.
CREATE TRIGGER community_wallets_no_truncate
BEFORE TRUNCATE ON public.community_wallets
FOR EACH STATEMENT EXECUTE FUNCTION community_private.guard_community_ledger_truncate();
CREATE TRIGGER community_ledger_accounts_no_truncate
BEFORE TRUNCATE ON public.community_ledger_accounts
FOR EACH STATEMENT EXECUTE FUNCTION community_private.guard_community_ledger_truncate();
CREATE TRIGGER community_ledger_transactions_no_truncate
BEFORE TRUNCATE ON public.community_ledger_transactions
FOR EACH STATEMENT EXECUTE FUNCTION community_private.guard_community_ledger_truncate();
CREATE TRIGGER community_ledger_entries_no_truncate
BEFORE TRUNCATE ON public.community_ledger_entries
FOR EACH STATEMENT EXECUTE FUNCTION community_private.guard_community_ledger_truncate();
ALTER TABLE public.community_wallets
  ENABLE ALWAYS TRIGGER community_wallets_no_truncate;
ALTER TABLE public.community_ledger_accounts
  ENABLE ALWAYS TRIGGER community_ledger_accounts_no_truncate;
ALTER TABLE public.community_ledger_transactions
  ENABLE ALWAYS TRIGGER community_ledger_transactions_no_truncate;
ALTER TABLE public.community_ledger_entries
  ENABLE ALWAYS TRIGGER community_ledger_entries_no_truncate;

-- Tables and trigger functions are owned by postgres. Application roles receive
-- no table writes, no ledger reads, and no EXECUTE on these internal triggers.
ALTER TABLE public.community_wallets OWNER TO postgres;
ALTER TABLE public.community_ledger_accounts OWNER TO postgres;
ALTER TABLE public.community_ledger_transactions OWNER TO postgres;
ALTER TABLE public.community_ledger_entries OWNER TO postgres;
ALTER FUNCTION community_private.guard_community_ledger_account() OWNER TO postgres;
ALTER FUNCTION community_private.guard_community_ledger_truncate() OWNER TO postgres;
ALTER FUNCTION community_private.guard_community_ledger_transaction() OWNER TO postgres;
ALTER FUNCTION community_private.guard_community_ledger_entry() OWNER TO postgres;

ALTER TABLE public.community_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_ledger_entries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.community_wallets,
  public.community_ledger_accounts,
  public.community_ledger_transactions,
  public.community_ledger_entries
FROM PUBLIC, anon, authenticated, service_role;

-- Expose only non-financial wallet metadata to its owner. No account balances,
-- system accounts, transactions, or raw entries are readable by app roles.
GRANT SELECT (id, currency, status, created_at)
  ON TABLE public.community_wallets TO authenticated;
CREATE POLICY community_wallets_owner_select
  ON public.community_wallets
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON FUNCTION community_private.guard_community_ledger_account()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION community_private.guard_community_ledger_truncate()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION community_private.guard_community_ledger_transaction()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION community_private.guard_community_ledger_entry()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
