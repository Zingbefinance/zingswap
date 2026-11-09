begin;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (char_length(username) between 3 and 24 and username ~ '^[a-z0-9_]+$'),
  display_name text not null check (char_length(display_name) between 1 and 50),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  bio text check (bio is null or char_length(bio) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (user_id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  name text not null check (char_length(name) between 2 and 80),
  ticker text check (ticker is null or (char_length(ticker) between 1 and 16 and ticker ~ '^[A-Za-z0-9]+$')),
  chain text not null check (char_length(chain) between 2 and 40),
  contract_address text check (contract_address is null or char_length(contract_address) <= 256),
  description text not null default '' check (char_length(description) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'published', 'rejected', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (user_id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (user_id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending', 'published', 'hidden', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.likes (
  user_id uuid not null references public.profiles (user_id) on delete cascade,
  post_id uuid not null references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.profiles (user_id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  post_id uuid references public.posts (id) on delete set null,
  comment_id uuid references public.comments (id) on delete set null,
  target_type text not null check (target_type in ('project', 'post', 'comment')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'scam', 'abuse', 'impersonation', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  check (
    num_nonnulls(project_id, post_id, comment_id) <= 1
    and (
      (project_id is null and post_id is null and comment_id is null)
      or (project_id is not null and target_type = 'project' and target_id = project_id)
      or (post_id is not null and target_type = 'post' and target_id = post_id)
      or (comment_id is not null and target_type = 'comment' and target_id = comment_id)
    )
  )
);

create index if not exists projects_owner_created_idx on public.projects (owner_id, created_at desc);
create index if not exists projects_published_created_idx on public.projects (created_at desc) where status = 'published';
create index if not exists posts_project_created_idx on public.posts (project_id, created_at desc) where status = 'published';
create index if not exists posts_author_created_idx on public.posts (author_id, created_at desc);
create index if not exists posts_published_created_idx on public.posts (created_at desc) where status = 'published';
create index if not exists comments_post_created_idx on public.comments (post_id, created_at asc) where status = 'published';
create index if not exists comments_author_created_idx on public.comments (author_id, created_at desc);
create index if not exists reports_reporter_created_idx on public.reports (reporter_id, created_at desc);
create unique index if not exists reports_project_once_idx on public.reports (reporter_id, project_id) where project_id is not null;
create unique index if not exists reports_post_once_idx on public.reports (reporter_id, post_id) where post_id is not null;
create unique index if not exists reports_comment_once_idx on public.reports (reporter_id, comment_id) where comment_id is not null;

create or replace function public.set_community_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.create_community_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, username, display_name)
  values (
    new.id,
    'user_' || left(replace(new.id::text, '-', ''), 19),
    coalesce(nullif(left(btrim(new.raw_user_meta_data ->> 'display_name'), 50), ''), 'Membre')
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_community_profile() from public, anon, authenticated;

drop trigger if exists community_profiles_updated_at on public.profiles;
create trigger community_profiles_updated_at before update on public.profiles
for each row execute function public.set_community_updated_at();

drop trigger if exists community_projects_updated_at on public.projects;
create trigger community_projects_updated_at before update on public.projects
for each row execute function public.set_community_updated_at();

drop trigger if exists community_posts_updated_at on public.posts;
create trigger community_posts_updated_at before update on public.posts
for each row execute function public.set_community_updated_at();

drop trigger if exists community_comments_updated_at on public.comments;
create trigger community_comments_updated_at before update on public.comments
for each row execute function public.set_community_updated_at();

drop trigger if exists community_auth_user_created on auth.users;
create trigger community_auth_user_created after insert on auth.users
for each row execute function public.create_community_profile();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.reports enable row level security;

revoke all on public.profiles, public.projects, public.posts, public.comments, public.likes, public.reports from anon, authenticated;

grant select on public.profiles, public.projects, public.posts, public.comments, public.likes to anon, authenticated;
grant update (username, display_name, avatar_url, bio) on public.profiles to authenticated;

grant insert (owner_id, slug, name, ticker, chain, contract_address, description),
  update (slug, name, ticker, chain, contract_address, description), delete on public.projects to authenticated;
grant insert (author_id, project_id, body), update (project_id, body), delete on public.posts to authenticated;
grant insert (post_id, author_id, body), update (body), delete on public.comments to authenticated;
grant insert (user_id, post_id), delete on public.likes to authenticated;
grant select on public.reports to authenticated;
grant insert (reporter_id, project_id, post_id, comment_id, target_type, target_id, reason, details) on public.reports to authenticated;

create policy "Public profiles are readable"
  on public.profiles for select to anon, authenticated using (true);
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Published projects and owners can read"
  on public.projects for select to anon, authenticated
  using (status = 'published' or (select auth.uid()) = owner_id);
create policy "Users submit projects for review"
  on public.projects for insert to authenticated
  with check ((select auth.uid()) = owner_id and status = 'pending');
create policy "Owners edit pending projects"
  on public.projects for update to authenticated
  using ((select auth.uid()) = owner_id and status = 'pending')
  with check ((select auth.uid()) = owner_id and status = 'pending');
create policy "Owners delete pending projects"
  on public.projects for delete to authenticated
  using ((select auth.uid()) = owner_id and status = 'pending');

create policy "Published posts and authors can read"
  on public.posts for select to anon, authenticated
  using (
    (status = 'published' and (project_id is null or exists (
      select 1 from public.projects p where p.id = project_id and p.status = 'published'
    )))
    or (select auth.uid()) = author_id
  );
create policy "Users submit posts for review"
  on public.posts for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and status = 'pending'
    and (project_id is null or exists (
      select 1 from public.projects p
      where p.id = project_id and (p.status = 'published' or p.owner_id = (select auth.uid()))
    ))
  );
create policy "Authors edit pending posts"
  on public.posts for update to authenticated
  using ((select auth.uid()) = author_id and status = 'pending')
  with check (
    (select auth.uid()) = author_id
    and status = 'pending'
    and (project_id is null or exists (
      select 1 from public.projects p
      where p.id = project_id and (p.status = 'published' or p.owner_id = (select auth.uid()))
    ))
  );
create policy "Authors delete their posts"
  on public.posts for delete to authenticated
  using ((select auth.uid()) = author_id);

create policy "Published comments and authors can read"
  on public.comments for select to anon, authenticated
  using (
    (status = 'published' and exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.status = 'published'
        and (p.project_id is null or exists (
          select 1 from public.projects pr
          where pr.id = p.project_id and pr.status = 'published'
        ))
    ))
    or (select auth.uid()) = author_id
  );
create policy "Users submit comments for review"
  on public.comments for insert to authenticated
  with check (
    (select auth.uid()) = author_id
    and status = 'pending'
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.status = 'published'
        and (p.project_id is null or exists (
          select 1 from public.projects pr
          where pr.id = p.project_id and pr.status = 'published'
        ))
    )
  );
create policy "Authors edit pending comments"
  on public.comments for update to authenticated
  using ((select auth.uid()) = author_id and status = 'pending')
  with check ((select auth.uid()) = author_id and status = 'pending');
create policy "Authors delete their comments"
  on public.comments for delete to authenticated
  using ((select auth.uid()) = author_id);

create policy "Likes on published posts are readable"
  on public.likes for select to anon, authenticated
  using (exists (
    select 1 from public.posts p
    where p.id = post_id
      and p.status = 'published'
      and (p.project_id is null or exists (
        select 1 from public.projects pr
        where pr.id = p.project_id and pr.status = 'published'
      ))
  ));
create policy "Users like published posts"
  on public.likes for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.posts p
      where p.id = post_id
        and p.status = 'published'
        and (p.project_id is null or exists (
          select 1 from public.projects pr
          where pr.id = p.project_id and pr.status = 'published'
        ))
    )
  );
create policy "Users remove their likes"
  on public.likes for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Reporters can read their reports"
  on public.reports for select to authenticated
  using ((select auth.uid()) = reporter_id);
create policy "Users report published content"
  on public.reports for insert to authenticated
  with check (
    (select auth.uid()) = reporter_id
    and status = 'open'
    and (
      (target_type = 'project' and project_id = target_id and exists (select 1 from public.projects p where p.id = project_id and p.status = 'published'))
      or (post_id is not null and exists (
        select 1 from public.posts p where target_type = 'post' and post_id = target_id and p.id = post_id and p.status = 'published'
          and (p.project_id is null or exists (
            select 1 from public.projects pr where pr.id = p.project_id and pr.status = 'published'
          ))
      ))
      or (comment_id is not null and exists (
        select 1 from public.comments c join public.posts p on p.id = c.post_id
        where target_type = 'comment'
          and comment_id = target_id
          and c.id = comment_id
          and c.status = 'published'
          and p.status = 'published'
          and (p.project_id is null or exists (
            select 1 from public.projects pr
            where pr.id = p.project_id and pr.status = 'published'
          ))
      ))
    )
  );

commit;
