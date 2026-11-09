# Community profile visibility checks

These checks are prepared for the separate Supabase development project. They
have not been run against PostgreSQL or Supabase. The SQL below is read-only;
the account tests use the real A and B sessions and must not use a service-role
key or impersonate users from an administrator connection.

## Read-only catalog and privilege checks

Run after applying `20261105130000_community_profile_visibility.sql`:

```sql
-- Expected: anon_base_select=false, auth_base_select=true,
-- anon_view_select=true, auth_view_select=true.
SELECT
  has_table_privilege('anon', 'public.profiles', 'SELECT') AS anon_base_select,
  has_table_privilege('authenticated', 'public.profiles', 'SELECT') AS auth_base_select,
  has_table_privilege('anon', 'public.community_public_profiles', 'SELECT') AS anon_view_select,
  has_table_privilege('authenticated', 'public.community_public_profiles', 'SELECT') AS auth_view_select;

-- Expected columns, in order: username, display_name, avatar_url, bio.
SELECT array_agg(a.attname ORDER BY a.attnum) AS exposed_view_columns
FROM pg_attribute AS a
WHERE a.attrelid = 'public.community_public_profiles'::regclass
  AND a.attnum > 0
  AND NOT a.attisdropped;

-- Expected owner: postgres. security_barrier should be true.
SELECT c.relowner::regrole AS view_owner, c.reloptions
FROM pg_class AS c
WHERE c.oid = 'public.community_public_profiles'::regclass;

-- Expected: one SELECT policy for authenticated, checking auth.uid() = user_id.
SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles';

-- Expected: anonymous cannot update the base table; authenticated users can
-- update only the four profile attributes, never user_id or timestamps.
SELECT
  has_table_privilege('anon', 'public.profiles', 'UPDATE') AS anon_table_update,
  has_column_privilege('authenticated', 'public.profiles', 'username', 'UPDATE') AS auth_username_update,
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE') AS auth_display_name_update,
  has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'UPDATE') AS auth_avatar_update,
  has_column_privilege('authenticated', 'public.profiles', 'bio', 'UPDATE') AS auth_bio_update,
  has_column_privilege('authenticated', 'public.profiles', 'user_id', 'UPDATE') AS auth_user_id_update,
  has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE') AS auth_created_at_update,
  has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'UPDATE') AS auth_updated_at_update;
```

## Access tests using real sessions

Use the Supabase public project URL and public client key with a separate
browser session for A and B. Do not copy, print, or log access or refresh
tokens. These are read tests and do not modify profiles:

1. **Anonymous:** query `community_public_profiles` for a known test username;
   the response must contain only `username`, `display_name`, `avatar_url`,
   and `bio`. A direct `profiles` query must be denied.
2. **A, own profile:** query `profiles` filtered by A's own `user_id`; exactly
   one row should be visible. Querying the same table filtered by B's ID should
   return zero rows. A query to `community_public_profiles` may return public
   profiles.
3. **B, own profile:** repeat with B's session; B sees their own base row and
   zero rows for A's ID.
4. **Writes:** do not run cross-account or own-profile update tests against
   existing accounts until explicitly authorized. When approved, use valid
   sentinel values, request `RETURNING user_id` (PostgREST `.select('user_id')`)
   and verify the affected row count. Restore the exact original values in the
   same authenticated session. A denied update or zero returned rows is not a
   successful modification.

## Application compatibility

`/community/profile` may continue reading the signed-in user's base row because
authenticated `SELECT` remains granted and RLS permits only that user's row.
Its existing update policy and column grants are unchanged. Signup's profile
trigger writes to the base table and is not changed by this migration; login
does not query the public view. A future public profile page should query
`community_public_profiles`, never `profiles`.
