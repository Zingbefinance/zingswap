# Community visibility and reporting test scenarios

Run these scenarios only against an isolated PostgreSQL/Supabase test database
after applying `20261105090000_community_auth_foundation.sql`. Do not link the
test CLI to the main Supabase project. Use two ordinary authenticated users
(`user_a`, `user_b`), an anonymous session, and the privileged moderation role
(`service_role` in Supabase).

## Fixture matrix

Create projects owned by A and B in `pending` and `published` states. Create
posts in `pending` and `published` states, both without a project and attached
to each project state. Create published and pending comments on each post, plus
likes on published posts. Create one report for each published project, post,
and comment. Privileged setup may set fixture statuses; ordinary users must not.

## Expected cases

| Role | Operation | Expected result |
| --- | --- | --- |
| `anon` | Read published projects | Published rows visible; pending, rejected, and archived projects hidden. |
| `anon` | Read published posts with no project or a published project | Visible. |
| `anon` | Read a published post attached to a pending, rejected, or archived project | Hidden. |
| `anon` | Read a pending post | Hidden. |
| `anon` | Read a published comment on a visible post | Visible. |
| `anon` | Read a comment where the post is pending or its project is not published | Hidden, even if the comment status is `published`. |
| `anon` | Read a pending comment | Hidden. |
| `anon` | Read likes on a publicly visible post | Visible. |
| `anon` | Read likes on a post hidden by its status or project status | Hidden. |
| `anon` | Read reports | Denied by SQL privileges; reports are never public. |
| A | Read A's own pending or moderated project, post, and comment | Visible privately to A; this owner access does not make the row visible to B or `anon`. |
| A | Read B's pending content | Hidden. |
| B / `anon` | Read a published post/comment under an unpublished project, including when A owns the post | Hidden. |
| A | Report A's own published post/comment under an unpublished project | Rejected; owner-only read access must not bypass the public-target checks in the report insert policy. |
| A | Submit a pending post with no project, a published project, or A's own project | Allowed, provided all other required fields are valid. |
| A | Submit or update a post linked to B's pending project | Rejected. Repeat for both INSERT and UPDATE. |
| A | Set a project, post, or comment status to `published` or another moderation status | Rejected for ordinary users. |
| A | Submit a pending comment on a publicly visible published post | Allowed. |
| A | Submit a comment on a pending post or a post whose project is not published | Rejected. |
| A | Like a publicly visible published post as A | Allowed. |
| A | Like a pending post or a post whose project is not published | Rejected. |
| A | Report a published project, visible post, or visible comment | Allowed once, with status `open`. |
| A | Report a pending target or a published post/comment under an unpublished project | Rejected. |
| B | Read A's report or modify/delete it | Read denied; writes denied by SQL privileges and RLS. |
| Authenticated A | Modify B's profile, project, post, comment, or like | No row may be changed; INSERT/UPDATE checks must reject forged owner IDs. |
| `service_role` | Read hidden/pending fixtures and change their moderation status | Allowed as privileged moderation setup; this role bypasses RLS and must remain server-only. |
| Privileged setup | Delete a reported project, post, comment, or reporter profile | Report row remains; the applicable FK becomes NULL; `target_type` and `target_id` remain unchanged. |

## Execution notes

Run each read/insert scenario with the corresponding database role and JWT
subject set to A or B. Verify both returned rows and rejected writes. Run the
visibility queries for comments, likes, and reports to detect recursive RLS
errors; each should terminate normally. Verify report retention after each
target deletion type and after deleting the reporter profile.

For an automated suite, translate these cases into pgTAP assertions in this
directory and run them with `supabase test db` against a local Supabase stack,
or `supabase test db --linked` only after explicitly linking an isolated test
project. Never use `--linked` while the main project is linked.
