BEGIN;

-- Moderator-only project review. This migration adds RPC access only; it does
-- not change public.projects grants or RLS policies.

CREATE FUNCTION public.list_pending_community_projects()
RETURNS TABLE (
  id uuid,
  name text,
  ticker text,
  chain text,
  contract_address text,
  description text,
  slug text,
  created_at timestamptz
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
  SELECT
    project.id,
    project.name,
    project.ticker,
    project.chain,
    project.contract_address,
    project.description,
    project.slug,
    project.created_at
  FROM public.projects AS project
  WHERE project.status = 'pending'
  ORDER BY project.created_at ASC
  LIMIT 100;
END;
$function$;

ALTER FUNCTION public.list_pending_community_projects() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_pending_community_projects()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_community_projects()
  TO authenticated;

CREATE FUNCTION public.moderate_community_project(
  p_project_id uuid,
  p_decision text
)
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

  UPDATE public.projects AS project
  SET status = p_decision
  WHERE project.id = p_project_id
    AND project.status = 'pending';

  -- TRUE confirms a transition; FALSE means no pending project was changed.
  RETURN FOUND;
END;
$function$;

ALTER FUNCTION public.moderate_community_project(uuid, text)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.moderate_community_project(
  uuid, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderate_community_project(
  uuid, text
) TO authenticated;

COMMENT ON FUNCTION public.list_pending_community_projects() IS
  'Moderator-only pending project queue; returns review fields without owner data.';
COMMENT ON FUNCTION public.moderate_community_project(uuid, text) IS
  'Moderator-only transition of a pending project to published or rejected; returns whether a row changed.';

COMMIT;
