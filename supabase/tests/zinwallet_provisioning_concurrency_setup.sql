\set ON_ERROR_STOP on

BEGIN;
DO $fixture_check$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users
             WHERE id = 'b8da5e88-5197-4fa4-9a00-000000000903') THEN
    RAISE EXCEPTION 'Concurrency fixture UUID collision';
  END IF;
END;
$fixture_check$;

-- Model a registered account predating wallet provisioning. Concurrent RPC
-- calls below must win the unique user_id race and create exactly one wallet.
ALTER TABLE auth.users DISABLE TRIGGER community_wallets_provision_user;
INSERT INTO auth.users(id) VALUES ('b8da5e88-5197-4fa4-9a00-000000000903');
ALTER TABLE auth.users ENABLE TRIGGER community_wallets_provision_user;
COMMIT;

\echo 'Legacy unprovisioned-user concurrency fixture ready.'
