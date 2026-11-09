BEGIN;

-- Apply after 20261106153000_community_public_feed_security.sql and
-- 20261106170000_community_moderation_v1.sql. This intentionally enables
-- immediate visibility for authenticated submissions; review still must be
-- available through the moderator-only hide RPCs below.

GRANT INSERT (status) ON TABLE public.posts, public.comments TO authenticated;

DROP POLICY "Users submit posts for review" ON public.posts;
CREATE POLICY "Users submit posts"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = author_id
    AND status IN ('pending', 'published')
    AND community_private.can_attach_project(project_id)
  );

DROP POLICY "Users submit comments for review" ON public.comments;
CREATE POLICY "Users submit comments"
  ON public.comments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = author_id
    AND status IN ('pending', 'published')
    AND community_private.is_public_post(post_id)
  );

CREATE OR REPLACE FUNCTION public.moderate_community_post(p_post_id uuid, p_decision text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT community_private.is_community_moderator() THEN
    RAISE EXCEPTION 'Moderator access required' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('published', 'rejected', 'hidden') THEN
    RAISE EXCEPTION 'Invalid moderation decision' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'hidden' THEN
    UPDATE public.posts SET status = 'hidden'
    WHERE id = p_post_id AND status = 'published';
  ELSE
    UPDATE public.posts SET status = p_decision
    WHERE id = p_post_id AND status = 'pending';
  END IF;

  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.moderate_community_comment(p_comment_id uuid, p_decision text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT community_private.is_community_moderator() THEN
    RAISE EXCEPTION 'Moderator access required' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('published', 'rejected', 'hidden') THEN
    RAISE EXCEPTION 'Invalid moderation decision' USING ERRCODE = '22023';
  END IF;

  IF p_decision = 'hidden' THEN
    UPDATE public.comments SET status = 'hidden'
    WHERE id = p_comment_id AND status = 'published';
  ELSE
    UPDATE public.comments SET status = p_decision
    WHERE id = p_comment_id AND status = 'pending';
  END IF;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.moderate_community_post(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_community_post(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.moderate_community_comment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_community_comment(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.moderate_community_post(uuid, text) IS
  'Moderator-only transition of pending posts to published/rejected and published posts to hidden.';
COMMENT ON FUNCTION public.moderate_community_comment(uuid, text) IS
  'Moderator-only transition of pending comments to published/rejected and published comments to hidden.';

COMMIT;
