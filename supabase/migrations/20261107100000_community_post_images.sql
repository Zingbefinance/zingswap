BEGIN;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS image_path text;
COMMENT ON COLUMN public.posts.image_path IS
  'Public Storage object path for an optional Community post image; the path is exposed only by the public feed view.';

GRANT INSERT (image_path) ON TABLE public.posts TO authenticated;

DROP POLICY IF EXISTS "Users submit posts" ON public.posts;
CREATE POLICY "Users submit posts"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = author_id
    AND status IN ('pending', 'published')
    AND community_private.can_attach_project(project_id)
    AND (
      image_path IS NULL
      OR split_part(image_path, '/', 1) = (SELECT auth.uid())::text
    )
  );

CREATE OR REPLACE VIEW public.community_public_feed
  WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  post.id AS post_id,
  post.body,
  post.created_at,
  profile.display_name,
  profile.avatar_url,
  post.image_path
FROM public.posts AS post
JOIN public.profiles AS profile
  ON profile.user_id = post.author_id
WHERE post.status = 'published'
  AND (
    post.project_id IS NULL
    OR community_private.is_public_project(post.project_id)
  );
COMMENT ON VIEW public.community_public_feed IS
  'Public post projection; exposes post content, display name, avatar, and optional public image path only.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'community-post-images',
  'community-post-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO NOTHING;

DO $bucket_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'community-post-images'
      AND name = 'community-post-images'
      AND public
      AND file_size_limit = 5242880
      AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ) THEN
    RAISE EXCEPTION 'Existing community-post-images bucket does not match the required public image constraints';
  END IF;
END;
$bucket_check$;

DROP POLICY IF EXISTS "Community users upload own post images" ON storage.objects;
CREATE POLICY "Community users upload own post images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'community-post-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS "Community users remove own post images" ON storage.objects;
CREATE POLICY "Community users remove own post images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'community-post-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

COMMIT;
