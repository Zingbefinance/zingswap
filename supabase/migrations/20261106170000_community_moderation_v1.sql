BEGIN;

-- Requires 20261106153000_community_public_feed_security.sql to be applied first.
-- Moderators must be assigned app_metadata.community_role = 'moderator' by a
-- trusted Supabase administrator. Never use user_metadata for authorization.
-- The dashboard role change takes effect after the user's JWT is refreshed.

CREATE FUNCTION community_private.is_community_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND coalesce((SELECT auth.jwt() -> 'app_metadata' ->> 'community_role'), '') = 'moderator';
$function$;

ALTER FUNCTION community_private.is_community_moderator() OWNER TO postgres;
REVOKE ALL ON FUNCTION community_private.is_community_moderator()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION community_private.is_community_moderator()
  TO authenticated;

CREATE FUNCTION public.list_pending_community_posts()
RETURNS TABLE (
  post_id uuid,
  body text,
  created_at timestamptz,
  display_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT community_private.is_community_moderator() THEN
    RAISE EXCEPTION 'Moderator access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT post.id, post.body, post.created_at, profile.display_name
  FROM public.posts AS post
  JOIN public.profiles AS profile ON profile.user_id = post.author_id
  WHERE post.status = 'pending'
  ORDER BY post.created_at ASC;
END;
$function$;

ALTER FUNCTION public.list_pending_community_posts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_pending_community_posts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_community_posts() TO authenticated;

CREATE FUNCTION public.list_pending_community_comments()
RETURNS TABLE (
  comment_id uuid,
  post_id uuid,
  body text,
  created_at timestamptz,
  display_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT community_private.is_community_moderator() THEN
    RAISE EXCEPTION 'Moderator access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT comment.id, comment.post_id, comment.body, comment.created_at, profile.display_name
  FROM public.comments AS comment
  JOIN public.profiles AS profile ON profile.user_id = comment.author_id
  WHERE comment.status = 'pending'
  ORDER BY comment.created_at ASC;
END;
$function$;

ALTER FUNCTION public.list_pending_community_comments() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_pending_community_comments() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_community_comments() TO authenticated;

CREATE FUNCTION public.moderate_community_post(p_post_id uuid, p_decision text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT community_private.is_community_moderator() THEN
    RAISE EXCEPTION 'Moderator access required' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('published', 'rejected') THEN
    RAISE EXCEPTION 'Invalid moderation decision' USING ERRCODE = '22023';
  END IF;

  UPDATE public.posts
  SET status = p_decision
  WHERE id = p_post_id AND status = 'pending';

  RETURN FOUND;
END;
$function$;

ALTER FUNCTION public.moderate_community_post(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.moderate_community_post(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_community_post(uuid, text) TO authenticated;

CREATE FUNCTION public.moderate_community_comment(p_comment_id uuid, p_decision text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT community_private.is_community_moderator() THEN
    RAISE EXCEPTION 'Moderator access required' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('published', 'rejected') THEN
    RAISE EXCEPTION 'Invalid moderation decision' USING ERRCODE = '22023';
  END IF;

  UPDATE public.comments
  SET status = p_decision
  WHERE id = p_comment_id AND status = 'pending';

  RETURN FOUND;
END;
$function$;

ALTER FUNCTION public.moderate_community_comment(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.moderate_community_comment(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_community_comment(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.list_pending_community_posts() IS
  'Moderator-only pending post queue; never returns author_id.';
COMMENT ON FUNCTION public.list_pending_community_comments() IS
  'Moderator-only pending comment queue; never returns author_id.';
COMMENT ON FUNCTION public.moderate_community_post(uuid, text) IS
  'Moderator-only transition from pending to published or rejected.';
COMMENT ON FUNCTION public.moderate_community_comment(uuid, text) IS
  'Moderator-only transition from pending to published or rejected.';

COMMIT;
