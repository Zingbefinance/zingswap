BEGIN;

-- Moderator-only access to reports and their associated content.
-- Requires community_private.is_community_moderator() and the Community schema.

CREATE FUNCTION public.list_community_reports()
RETURNS TABLE (
  report_id uuid,
  target_type text,
  target_id uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  content_available boolean,
  content_label text,
  content_text text,
  content_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT community_private.is_community_moderator() THEN
    RAISE EXCEPTION 'Moderator access required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    report.id,
    report.target_type,
    report.target_id,
    report.reason,
    report.details,
    report.status,
    report.created_at,
    CASE report.target_type
      WHEN 'project' THEN project.id IS NOT NULL
      WHEN 'post' THEN post.id IS NOT NULL
      WHEN 'comment' THEN comment.id IS NOT NULL
      ELSE false
    END,
    CASE report.target_type
      WHEN 'project' THEN project.name
      ELSE NULL::text
    END,
    CASE report.target_type
      WHEN 'project' THEN project.description
      WHEN 'post' THEN post.body
      WHEN 'comment' THEN comment.body
      ELSE NULL::text
    END,
    CASE report.target_type
      WHEN 'project' THEN project.status
      WHEN 'post' THEN post.status
      WHEN 'comment' THEN comment.status
      ELSE NULL::text
    END
  FROM public.reports AS report
  LEFT JOIN public.projects AS project
    ON report.target_type = 'project'
   AND report.project_id = project.id
  LEFT JOIN public.posts AS post
    ON report.target_type = 'post'
   AND report.post_id = post.id
  LEFT JOIN public.comments AS comment
    ON report.target_type = 'comment'
   AND report.comment_id = comment.id
  ORDER BY report.created_at DESC, report.id DESC
  LIMIT 100;
END;
$function$;

ALTER FUNCTION public.list_community_reports() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_community_reports() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_community_reports() TO authenticated;
COMMENT ON FUNCTION public.list_community_reports() IS
  'Returns at most 100 newest reports and minimal target content to moderators only.';

CREATE FUNCTION public.moderate_community_report(p_report_id uuid, p_status text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NOT community_private.is_community_moderator() THEN
    RAISE EXCEPTION 'Moderator access required' USING ERRCODE = '42501';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('reviewing', 'resolved', 'dismissed') THEN
    RAISE EXCEPTION 'Invalid report status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.reports AS report
  SET status = p_status
  WHERE report.id = p_report_id
    AND report.status IN ('open', 'reviewing');

  RETURN FOUND;
END;
$function$;

ALTER FUNCTION public.moderate_community_report(uuid, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.moderate_community_report(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_community_report(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.moderate_community_report(uuid, text) IS
  'Moves an open or reviewing report to reviewing, resolved, or dismissed; moderators only.';

COMMIT;
