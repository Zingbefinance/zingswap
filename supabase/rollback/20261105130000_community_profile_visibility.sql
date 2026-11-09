BEGIN;

REVOKE ALL ON TABLE public.community_public_profiles
  FROM PUBLIC, anon, authenticated;
DROP VIEW public.community_public_profiles;

DROP POLICY IF EXISTS "Profile owners can read their own profile"
  ON public.profiles;
CREATE POLICY "Public profiles are readable"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO anon, authenticated;

COMMIT;
