BEGIN;

-- Keep the base row private to its owner. The existing UPDATE policy and
-- column grants are left unchanged.
DROP POLICY IF EXISTS "Public profiles are readable" ON public.profiles;

CREATE POLICY "Profile owners can read their own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Remove direct public/anonymous access, including any inherited PUBLIC grant.
-- Authenticated users retain table access, restricted to their own row by RLS.
REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- This owner-rights view is the deliberate public projection. Its owner can
-- read the base table despite its owner-only RLS policy; callers receive only
-- the four approved public attributes. It has no write grants.
CREATE VIEW public.community_public_profiles
  WITH (security_barrier = true)
AS
  SELECT username, display_name, avatar_url, bio
  FROM public.profiles;

ALTER VIEW public.community_public_profiles OWNER TO postgres;

REVOKE ALL ON TABLE public.community_public_profiles
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.community_public_profiles TO anon, authenticated;

COMMENT ON VIEW public.community_public_profiles IS
  'Public profile projection. Owner-rights access is intentional; exposes only username, display_name, avatar_url, and bio.';

COMMIT;
