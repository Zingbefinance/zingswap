BEGIN;

-- C4.51 proposal: this migration is local and intentionally un-applied.
-- Before applying it to any environment, confirm that the deployed policies,
-- grants, table definitions, owners, and FK match the local migrations. In
-- particular, check for extra permissive policies and inherited table grants.
-- Test the complete migration in an isolated Supabase project first.
--
-- This design assumes the postgres role owns the protected tables or otherwise
-- bypasses RLS, and that FORCE ROW LEVEL SECURITY is not enabled on them.
-- SECURITY DEFINER helpers must remain in community_private, which must not be
-- included in PostgREST's exposed schemas. Its USAGE grant is needed for RLS
-- expressions; do not expose it through the Data API.

CREATE SCHEMA community_private AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA community_private FROM PUBLIC;
GRANT USAGE ON SCHEMA community_private TO anon, authenticated;

-- Internal predicate: only authenticated policies need this helper directly.
-- It returns no project fields and must not be exposed as a PostgREST RPC.
CREATE FUNCTION community_private.is_public_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects AS project
    WHERE project.id = p_project_id
      AND project.status = 'published'
  );
$function$;

ALTER FUNCTION community_private.is_public_project(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION community_private.is_public_project(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION community_private.is_public_project(uuid)
  TO anon, authenticated;

-- Public-post predicate used by the feed and dependent RLS policies.
CREATE FUNCTION community_private.is_public_post(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.posts AS post
    WHERE post.id = p_post_id
      AND post.status = 'published'
      AND (
        post.project_id IS NULL
        OR community_private.is_public_project(post.project_id)
      )
  );
$function$;

ALTER FUNCTION community_private.is_public_post(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION community_private.is_public_post(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION community_private.is_public_post(uuid)
  TO anon, authenticated;

-- Preserve the existing post SELECT policy semantics, including an author's
-- access to their own non-public posts. Direct SELECT remains revoked below.
CREATE FUNCTION community_private.can_read_post(p_post_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT community_private.is_public_post(p_post_id)
      OR EXISTS (
        SELECT 1
        FROM public.posts AS post
        WHERE post.id = p_post_id
          AND post.author_id = (SELECT auth.uid())
      );
$function$;

ALTER FUNCTION community_private.can_read_post(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION community_private.can_read_post(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION community_private.can_read_post(uuid)
  TO anon, authenticated;

-- Preserve the existing post INSERT/UPDATE project rule: a post may be
-- unassociated, attached to a published project, or attached to its author's
-- own project. The calling RLS policies separately enforce auth.uid() = author_id.
CREATE FUNCTION community_private.can_attach_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p_project_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.projects AS project
        WHERE project.id = p_project_id
          AND (
            project.status = 'published'
            OR project.owner_id = (SELECT auth.uid())
          )
      );
$function$;

ALTER FUNCTION community_private.can_attach_project(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION community_private.can_attach_project(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION community_private.can_attach_project(uuid)
  TO authenticated;

-- Reports may target only comments that are themselves public under the
-- existing published-comment and published-post rules.
CREATE FUNCTION community_private.is_public_comment(p_comment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.comments AS comment
    WHERE comment.id = p_comment_id
      AND comment.status = 'published'
      AND community_private.is_public_post(comment.post_id)
  );
$function$;

ALTER FUNCTION community_private.is_public_comment(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION community_private.is_public_comment(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION community_private.is_public_comment(uuid)
  TO authenticated;

-- The inner join deliberately excludes an orphan post with no profile. The
-- local author_id FK is ON DELETE CASCADE; confirm it exists and is validated.
-- This view is owner-rights (postgres) so it can read the owner-only profiles
-- relation. The explicit projection and status predicates are therefore vital.
CREATE VIEW public.community_public_feed
  WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  post.id AS post_id,
  post.body,
  post.created_at,
  profile.display_name,
  profile.avatar_url
FROM public.posts AS post
JOIN public.profiles AS profile
  ON profile.user_id = post.author_id
WHERE post.status = 'published'
  AND (
    post.project_id IS NULL
    OR community_private.is_public_project(post.project_id)
  );

ALTER VIEW public.community_public_feed OWNER TO postgres;
REVOKE ALL ON public.community_public_feed FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.community_public_feed TO anon, authenticated;
COMMENT ON VIEW public.community_public_feed IS
  'Public post projection; exposes no author_id, project_id, status, or profile user_id.';

-- Preserve public access to published projects after direct table SELECT is
-- revoked below. Expose only project fields intended for public discovery;
-- ownership and moderation state remain private. Owners retain their broader
-- read path through list_my_projects() below.
CREATE VIEW public.community_public_projects
  WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  project.id,
  project.slug,
  project.name,
  project.ticker,
  project.chain,
  project.contract_address,
  project.description,
  project.created_at
FROM public.projects AS project
WHERE project.status = 'published';

ALTER VIEW public.community_public_projects OWNER TO postgres;
REVOKE ALL ON public.community_public_projects FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.community_public_projects TO anon, authenticated;
COMMENT ON VIEW public.community_public_projects IS
  'Public projection of published projects; excludes owner_id, status, and updated_at.';

-- Public comments are projected with public author names inside the owner-rights
-- view. The inner joins and predicates fail closed if a post or author profile
-- is missing or the post/project is not public.
CREATE VIEW public.community_public_comments
  WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  comment.id AS comment_id,
  comment.post_id,
  comment.body,
  comment.created_at,
  profile.display_name
FROM public.comments AS comment
JOIN public.posts AS post ON post.id = comment.post_id
JOIN public.profiles AS profile ON profile.user_id = comment.author_id
WHERE comment.status = 'published'
  AND community_private.is_public_post(post.id);

ALTER VIEW public.community_public_comments OWNER TO postgres;
REVOKE ALL ON public.community_public_comments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.community_public_comments TO anon, authenticated;
COMMENT ON VIEW public.community_public_comments IS
  'Public comments on visible posts; exposes no author_id or profile user_id.';

-- Aggregate likes and published comments independently to avoid a likes x
-- comments join multiplying either count. Non-public posts are absent because
-- the source is the strictly filtered public feed view.
CREATE VIEW public.community_public_engagement
  WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  feed.post_id,
  COALESCE(like_totals.like_count, 0)::bigint AS like_count,
  COALESCE(comment_totals.comment_count, 0)::bigint AS comment_count
FROM public.community_public_feed AS feed
LEFT JOIN (
  SELECT post_id, count(*)::bigint AS like_count
  FROM public.likes
  GROUP BY post_id
) AS like_totals ON like_totals.post_id = feed.post_id
LEFT JOIN (
  SELECT comment.post_id, count(*)::bigint AS comment_count
  FROM public.comments AS comment
  WHERE comment.status = 'published'
    AND community_private.is_public_post(comment.post_id)
  GROUP BY comment.post_id
) AS comment_totals ON comment_totals.post_id = feed.post_id;

ALTER VIEW public.community_public_engagement OWNER TO postgres;
REVOKE ALL ON public.community_public_engagement FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.community_public_engagement TO anon, authenticated;
COMMENT ON VIEW public.community_public_engagement IS
  'Public like and published-comment counts keyed only by public post_id.';

-- RLS filters rows, not columns. Revoke direct SELECT so the public projection
-- is the only public feed path. Preflight must verify no inherited/custom role
-- grants restore these permissions.
REVOKE SELECT ON TABLE public.posts, public.projects
  FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.comments, public.likes
  FROM PUBLIC, anon, authenticated;

-- Also clear any explicit column-level grants. A table-level REVOKE does not
-- remove those. authenticated receives only id so PostgREST can filter
-- UPDATE/DELETE requests by primary key and request a minimal id response;
-- RLS still limits the rows, and no author_id/owner_id or other private column
-- is selectable. Do not grant anon direct SELECT on either base table.
REVOKE SELECT (
  id, author_id, project_id, body, status, created_at, updated_at
) ON TABLE public.posts FROM PUBLIC, anon, authenticated;
REVOKE SELECT (
  id, owner_id, slug, name, ticker, chain, contract_address, description,
  status, created_at, updated_at
) ON TABLE public.projects FROM PUBLIC, anon, authenticated;
REVOKE SELECT (
  id, post_id, author_id, body, status, created_at, updated_at
) ON TABLE public.comments FROM PUBLIC, anon, authenticated;
REVOKE SELECT (
  user_id, post_id, created_at
) ON TABLE public.likes FROM PUBLIC, anon, authenticated;
GRANT SELECT (id) ON TABLE public.posts TO authenticated;
GRANT SELECT (id) ON TABLE public.projects TO authenticated;
GRANT SELECT (id) ON TABLE public.comments TO authenticated;
-- Filtering a like deletion by post_id needs this limited privilege. The RLS
-- DELETE policy still restricts affected rows to auth.uid() = user_id.
GRANT SELECT (post_id) ON TABLE public.likes TO authenticated;

-- Replace the cross-table subqueries with narrow internal predicates. Other
-- author and status checks are kept equivalent to the local foundation policy.
DROP POLICY "Published posts and authors can read" ON public.posts;
CREATE POLICY "Published posts and authors can read"
  ON public.posts FOR SELECT TO anon, authenticated
  USING (community_private.can_read_post(id));

DROP POLICY "Users submit posts for review" ON public.posts;
CREATE POLICY "Users submit posts for review"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = author_id
    AND status = 'pending'
    AND community_private.can_attach_project(project_id)
  );

DROP POLICY "Authors edit pending posts" ON public.posts;
CREATE POLICY "Authors edit pending posts"
  ON public.posts FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = author_id AND status = 'pending')
  WITH CHECK (
    (SELECT auth.uid()) = author_id
    AND status = 'pending'
    AND community_private.can_attach_project(project_id)
  );

DROP POLICY "Published comments and authors can read" ON public.comments;
CREATE POLICY "Published comments and authors can read"
  ON public.comments FOR SELECT TO anon, authenticated
  USING (
    (
      status = 'published'
      AND community_private.is_public_post(post_id)
    )
    OR (SELECT auth.uid()) = author_id
  );

DROP POLICY "Users submit comments for review" ON public.comments;
CREATE POLICY "Users submit comments for review"
  ON public.comments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = author_id
    AND status = 'pending'
    AND community_private.is_public_post(post_id)
  );

DROP POLICY "Likes on published posts are readable" ON public.likes;
CREATE POLICY "Likes on published posts are readable"
  ON public.likes FOR SELECT TO anon, authenticated
  USING (community_private.is_public_post(post_id));

DROP POLICY "Users like published posts" ON public.likes;
CREATE POLICY "Users like published posts"
  ON public.likes FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND community_private.is_public_post(post_id)
  );

DROP POLICY "Users report published content" ON public.reports;
CREATE POLICY "Users report published content"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = reporter_id
    AND status = 'open'
    AND (
      (
        target_type = 'project'
        AND project_id = target_id
        AND community_private.is_public_project(project_id)
      )
      OR (
        target_type = 'post'
        AND post_id = target_id
        AND community_private.is_public_post(post_id)
      )
      OR (
        target_type = 'comment'
        AND comment_id = target_id
        AND community_private.is_public_comment(comment_id)
      )
    )
  );

-- Direct SELECT on posts/projects is revoked, so owner reads use these
-- authenticated RPCs. They return no author_id or owner_id and return no rows
-- without a valid auth.uid(). Keep public schema exposure limited as usual.
CREATE FUNCTION public.list_my_posts()
RETURNS TABLE (
  post_id uuid,
  project_id uuid,
  body text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT post.id, post.project_id, post.body, post.status, post.created_at
  FROM public.posts AS post
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND post.author_id = (SELECT auth.uid())
  ORDER BY post.created_at DESC;
$function$;

ALTER FUNCTION public.list_my_posts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_my_posts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_posts() TO authenticated;

CREATE FUNCTION public.list_my_projects()
RETURNS TABLE (
  project_id uuid,
  slug text,
  name text,
  ticker text,
  chain text,
  contract_address text,
  description text,
  status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    project.id,
    project.slug,
    project.name,
    project.ticker,
    project.chain,
    project.contract_address,
    project.description,
    project.status,
    project.created_at
  FROM public.projects AS project
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND project.owner_id = (SELECT auth.uid())
  ORDER BY project.created_at DESC;
$function$;

ALTER FUNCTION public.list_my_projects() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_my_projects() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_projects() TO authenticated;

-- Gives the current user like-state without exposing liker identities. The
-- public schema is exposed to PostgREST, so EXECUTE is authenticated-only.
CREATE FUNCTION public.list_my_liked_posts()
RETURNS TABLE (post_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT likes.post_id
  FROM public.likes AS likes
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND likes.user_id = (SELECT auth.uid())
    AND community_private.is_public_post(likes.post_id);
$function$;

ALTER FUNCTION public.list_my_liked_posts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_my_liked_posts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_liked_posts() TO authenticated;

-- Replace the FK only when catalog inspection proves there is exactly one FK
-- involving posts.project_id, that it targets projects(id), and that it is
-- validated ON DELETE SET NULL. Fail closed if production differs.
DO $migration$
DECLARE
  post_project_att smallint;
  project_id_att smallint;
  matching_count integer;
  involving_count integer;
  fk_name text;
  delete_action "char";
  update_action "char";
  match_type "char";
  is_deferrable boolean;
  is_deferred boolean;
  is_validated boolean;
BEGIN
  SELECT attnum
  INTO post_project_att
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.posts'::regclass
    AND attname = 'project_id'
    AND NOT attisdropped;

  SELECT attnum
  INTO project_id_att
  FROM pg_catalog.pg_attribute
  WHERE attrelid = 'public.projects'::regclass
    AND attname = 'id'
    AND NOT attisdropped;

  IF post_project_att IS NULL OR project_id_att IS NULL THEN
    RAISE EXCEPTION 'Expected public.posts.project_id and public.projects.id';
  END IF;

  SELECT count(*)
  INTO involving_count
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.posts'::regclass
    AND constraint_row.contype = 'f'
    AND post_project_att = ANY (constraint_row.conkey);

  SELECT count(*)
  INTO matching_count
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.posts'::regclass
    AND constraint_row.confrelid = 'public.projects'::regclass
    AND constraint_row.contype = 'f'
    AND constraint_row.conkey = ARRAY[post_project_att]::smallint[]
    AND constraint_row.confkey = ARRAY[project_id_att]::smallint[];

  IF involving_count <> 1 OR matching_count <> 1 THEN
    RAISE EXCEPTION
      'Expected exactly one single-column posts.project_id FK to projects.id; found % involving and % matching',
      involving_count, matching_count;
  END IF;

  SELECT constraint_row.conname,
         constraint_row.confdeltype,
         constraint_row.confupdtype,
         constraint_row.confmatchtype,
         constraint_row.condeferrable,
         constraint_row.condeferred,
         constraint_row.convalidated
  INTO fk_name, delete_action, update_action, match_type,
       is_deferrable, is_deferred, is_validated
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid = 'public.posts'::regclass
    AND constraint_row.confrelid = 'public.projects'::regclass
    AND constraint_row.contype = 'f'
    AND constraint_row.conkey = ARRAY[post_project_att]::smallint[]
    AND constraint_row.confkey = ARRAY[project_id_att]::smallint[];

  IF delete_action <> 'n'
     OR update_action <> 'a'
     OR match_type <> 's'
     OR is_deferrable
     OR is_deferred
     OR NOT is_validated THEN
    RAISE EXCEPTION
      'Expected validated FK with ON DELETE SET NULL, ON UPDATE NO ACTION, MATCH SIMPLE, and NOT DEFERRABLE; inspect the actual FK before migration';
  END IF;

  EXECUTE format('ALTER TABLE public.posts DROP CONSTRAINT %I', fk_name);
  EXECUTE format(
    'ALTER TABLE public.posts ADD CONSTRAINT %I
       FOREIGN KEY (project_id)
       REFERENCES public.projects(id)
       MATCH SIMPLE
       ON DELETE RESTRICT
       ON UPDATE NO ACTION',
    fk_name
  );
END;
$migration$;

COMMENT ON FUNCTION community_private.is_public_project(uuid) IS
  'Internal RLS predicate; community_private must not be exposed by PostgREST.';
COMMENT ON FUNCTION community_private.is_public_post(uuid) IS
  'Internal predicate for published posts with no project or a published project.';
COMMENT ON FUNCTION community_private.can_read_post(uuid) IS
  'Internal predicate preserving public-post and own-post read policy semantics.';
COMMENT ON FUNCTION community_private.can_attach_project(uuid) IS
  'Internal predicate preserving post attachment rules for authenticated authors.';
COMMENT ON FUNCTION community_private.is_public_comment(uuid) IS
  'Internal predicate used to validate reports on public comments.';

-- Write grants and their RLS policies are intentionally retained. Writes using
-- PostgREST's minimal return remain possible. The authenticated id-only SELECT
-- grant supports primary-key filters and an id-only representation while RLS
-- keeps row access restricted. Any client requesting other returned columns
-- must be changed to a restricted RPC or safe response; do not restore broad
-- SELECT merely to satisfy a representation request. INSERT paths must also be
-- tested with minimal return and id-only return.
--
-- Required isolated tests before application:
-- - after this migration, anon and authenticated feed reads expose the five
--   projected columns; the later image migration appends image_path explicitly;
-- - pending/hidden/rejected posts never appear in the public view;
-- - a published post with a non-published project is hidden;
-- - no-project published posts appear;
-- - community_public_projects exposes only published rows and its explicit
--   public columns; anon cannot SELECT from public.projects directly;
-- - owners read their own private posts/projects through the RPCs, while B
--   and anon cannot read A's private rows;
-- - comments, likes, reports, and all existing writes retain intended RLS;
-- - public comment projection contains only published comments on public posts,
--   and public engagement counts expose no liker or commenter identities;
-- - list_my_liked_posts returns only the authenticated caller's likes on
--   currently public posts; duplicate likes remain rejected by the PK;
-- - minimal PostgREST write responses work; representation responses do not
--   silently depend on revoked private-column SELECT; id-only representation
--   and UPDATE/DELETE filters by id work for authenticated owners;
-- - deleting a referenced project is rejected; archiving makes its posts
--   ineligible for the public feed;
-- - orphan author rows are excluded by the inner join, and the author FK is
--   present, validated, and has the expected ON DELETE CASCADE behavior;
-- - SECURITY DEFINER owners, search_path, EXECUTE ACLs, role inheritance, and
--   PostgREST exposed schemas match the assumptions above.
-- - inspect table and column grants, PUBLIC grants, role memberships/inherited
--   privileges, and effective anon/authenticated ACLs before applying; confirm
--   no custom role restores SELECT on private columns.

COMMIT;
