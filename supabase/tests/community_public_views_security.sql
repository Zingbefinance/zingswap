-- Read-only post-migration checks for migrations 3 through 6.
-- Run only after applying them to a disposable Supabase project.
-- This script performs catalog assertions and SELECTs only; it does not write.

BEGIN;

-- Review these references before the FK changes from ON DELETE SET NULL to
-- ON DELETE RESTRICT. They are not deleted or updated by this script.
SELECT
  project.id AS project_id,
  project.name,
  count(post.id) AS referencing_posts,
  count(post.id) FILTER (WHERE post.status = 'pending') AS pending_posts,
  count(post.id) FILTER (WHERE post.status = 'published') AS published_posts
FROM public.projects AS project
JOIN public.posts AS post ON post.project_id = project.id
GROUP BY project.id, project.name
ORDER BY project.name, project.id;

DO $checks$
DECLARE
  actual_columns text[];
  expected_columns text[];
  project_fk_count integer;
  project_view_definition text;
BEGIN
  IF to_regclass('public.community_public_projects') IS NULL THEN
    RAISE EXCEPTION 'Missing public.community_public_projects';
  END IF;

  expected_columns := ARRAY[
    'id', 'slug', 'name', 'ticker', 'chain',
    'contract_address', 'description', 'created_at'
  ];
  SELECT array_agg(column_name::text ORDER BY ordinal_position)
  INTO actual_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'community_public_projects';
  IF actual_columns IS DISTINCT FROM expected_columns THEN
    RAISE EXCEPTION 'Unexpected public project view columns: %', actual_columns;
  END IF;
  SELECT lower(pg_get_viewdef('public.community_public_projects'::regclass, true))
  INTO project_view_definition;
  IF position('published' IN project_view_definition) = 0 THEN
    RAISE EXCEPTION 'Public project view definition does not filter to published projects';
  END IF;

  IF NOT has_table_privilege('anon', 'public.community_public_projects', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.community_public_projects', 'SELECT') THEN
    RAISE EXCEPTION 'Expected anon and authenticated SELECT on public project view';
  END IF;
  IF has_any_column_privilege('anon', 'public.projects', 'SELECT') THEN
    RAISE EXCEPTION 'anon still has direct SELECT on public.projects';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.projects', 'id', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated needs SELECT(id) on public.projects for PostgREST filters';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns AS column_row
    WHERE column_row.table_schema = 'public'
      AND column_row.table_name = 'projects'
      AND column_row.column_name <> 'id'
      AND has_column_privilege(
        'authenticated', 'public.projects', column_row.column_name, 'SELECT'
      )
  ) THEN
    RAISE EXCEPTION 'authenticated has unexpected direct project-column SELECT';
  END IF;

  IF to_regprocedure('public.list_my_projects()') IS NULL
     OR NOT has_function_privilege('authenticated', 'public.list_my_projects()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.list_my_projects()', 'EXECUTE') THEN
    RAISE EXCEPTION 'list_my_projects must remain authenticated-only';
  END IF;

  SELECT count(*)
  INTO project_fk_count
  FROM pg_catalog.pg_constraint AS constraint_row
  JOIN pg_catalog.pg_attribute AS post_project_column
    ON post_project_column.attrelid = constraint_row.conrelid
   AND post_project_column.attname = 'project_id'
   AND NOT post_project_column.attisdropped
  JOIN pg_catalog.pg_attribute AS referenced_project_id
    ON referenced_project_id.attrelid = constraint_row.confrelid
   AND referenced_project_id.attname = 'id'
   AND NOT referenced_project_id.attisdropped
  WHERE constraint_row.conrelid = 'public.posts'::regclass
    AND constraint_row.confrelid = 'public.projects'::regclass
    AND constraint_row.contype = 'f'
    AND constraint_row.conkey = ARRAY[post_project_column.attnum]::smallint[]
    AND constraint_row.confkey = ARRAY[referenced_project_id.attnum]::smallint[]
    AND constraint_row.confdeltype = 'r'
    AND constraint_row.confupdtype = 'a'
    AND constraint_row.confmatchtype = 's'
    AND NOT constraint_row.condeferrable
    AND NOT constraint_row.condeferred
    AND constraint_row.convalidated;
  IF project_fk_count <> 1 THEN
    RAISE EXCEPTION 'Expected one validated posts.project_id FK with ON DELETE RESTRICT; found %', project_fk_count;
  END IF;

  IF to_regclass('public.community_public_feed') IS NULL
     OR to_regclass('public.community_public_comments') IS NULL
     OR to_regclass('public.community_public_engagement') IS NULL
     OR to_regclass('public.community_public_profiles') IS NULL THEN
    RAISE EXCEPTION 'One or more expected public Community views are missing';
  END IF;
  IF to_regprocedure('community_private.is_public_project(uuid)') IS NULL
     OR to_regprocedure('community_private.can_attach_project(uuid)') IS NULL
     OR to_regprocedure('public.list_my_liked_posts()') IS NULL
     OR to_regprocedure('public.list_pending_community_posts()') IS NULL
     OR to_regprocedure('public.list_pending_community_comments()') IS NULL
     OR to_regprocedure('public.moderate_community_post(uuid,text)') IS NULL
     OR to_regprocedure('public.moderate_community_comment(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'One or more expected Community functions are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'posts'
      AND column_name = 'image_path'
  ) THEN
    RAISE EXCEPTION 'Missing posts.image_path';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'community-post-images'
      AND public
      AND file_size_limit = 5242880
      AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
  ) THEN
    RAISE EXCEPTION 'community-post-images bucket is missing or has unexpected constraints';
  END IF;
END;
$checks$;

-- Confirm the public role can query the projections without direct table access.
SET LOCAL ROLE anon;
SELECT 'community_public_projects' AS view_name, count(*) AS visible_rows
FROM public.community_public_projects;
SELECT 'community_public_feed' AS view_name, count(*) AS visible_rows
FROM public.community_public_feed;
SELECT 'community_public_comments' AS view_name, count(*) AS visible_rows
FROM public.community_public_comments;
SELECT 'community_public_engagement' AS view_name, count(*) AS visible_rows
FROM public.community_public_engagement;
SELECT 'community_public_profiles' AS view_name, count(*) AS visible_rows
FROM public.community_public_profiles;
RESET ROLE;

ROLLBACK;
