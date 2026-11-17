"use client";

import Image from "next/image";
import Link from "next/link";
import { use, useEffect, useState } from "react";

import { getCommunityErrorMessage } from "@/lib/community/errors";
import { createClient } from "@/lib/supabase/client";

type PublicProfile = {
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
};

type MemberPost = {
  post_id: string;
  body: string;
  created_at: string;
  image_path: string | null;
  image_url: string | null;
  like_count: number;
  comment_count: number;
};

type PageState = "loading" | "ready" | "not-found" | "error";
const POST_IMAGE_BUCKET = "community-post-images";

function getInitials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function PublicMemberProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<MemberPost[]>([]);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadProfile() {
      const supabase = createClient();
      try {
        const profileResult = await supabase
          .from("community_public_profiles")
          .select("username, display_name, avatar_url, bio")
          .eq("username", username)
          .maybeSingle();
        if (profileResult.error) throw profileResult.error;
        if (!isActive) return;
        if (!profileResult.data) {
          setPageState("not-found");
          return;
        }

        const member = profileResult.data as PublicProfile;
        const postsResult = await supabase
          .from("community_public_feed")
          .select("post_id, body, created_at, image_path")
          .eq("username", username)
          .order("created_at", { ascending: false });
        if (postsResult.error) throw postsResult.error;
        const rows = (postsResult.data ?? []) as Array<Omit<MemberPost, "image_url" | "like_count" | "comment_count">>;

        const engagementResult = rows.length
          ? await supabase
              .from("community_public_engagement")
              .select("post_id, like_count, comment_count")
              .in("post_id", rows.map((post) => post.post_id))
          : { data: [], error: null };
        if (engagementResult.error) throw engagementResult.error;
        if (!isActive) return;

        const counts = new Map((engagementResult.data ?? []).map((row) => [row.post_id as string, row]));
        setProfile(member);
        setPosts(rows.map((post) => ({
          ...post,
          image_url: post.image_path
            ? supabase.storage.from(POST_IMAGE_BUCKET).getPublicUrl(post.image_path).data.publicUrl
            : null,
          like_count: Number(counts.get(post.post_id)?.like_count ?? 0),
          comment_count: Number(counts.get(post.post_id)?.comment_count ?? 0),
        })));
        setPageState("ready");
      } catch (error) {
        if (!isActive) return;
        setErrorMessage(getCommunityErrorMessage(error, "Le profil public est indisponible"));
        setPageState("error");
      }
    }

    void loadProfile();
    return () => { isActive = false; };
  }, [username]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/community/feed" className="text-sm font-medium text-cyan-300 hover:text-cyan-200">
        ← Retour au fil Community
      </Link>

      {pageState === "loading" && <p role="status" className="mt-6 text-zinc-300">Chargement du profil…</p>}
      {pageState === "not-found" && <p role="status" className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-300">Ce profil public est introuvable.</p>}
      {pageState === "error" && <p role="alert" className="mt-6 rounded-xl border border-red-900 bg-red-950/30 p-5 text-red-200">{errorMessage}</p>}

      {pageState === "ready" && profile && (
        <>
          <header className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-7">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-300/20 bg-cyan-300/10 text-lg font-semibold text-cyan-200">
              {profile.avatar_url ? (
                <Image src={profile.avatar_url} alt={`Photo de profil de ${profile.display_name}`} width={64} height={64} unoptimized className="h-full w-full object-cover" />
              ) : getInitials(profile.display_name)}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">Profil Community</p>
              <h1 className="mt-1 truncate text-2xl font-bold text-white">{profile.display_name}</h1>
              <p className="text-sm text-zinc-400">@{profile.username}</p>
            </div>
            {profile.bio && <p className="ml-auto max-w-sm whitespace-pre-wrap text-sm text-zinc-300">{profile.bio}</p>}
          </header>

          <section className="mt-6 space-y-4" aria-labelledby="member-posts-heading">
            <h2 id="member-posts-heading" className="text-xl font-semibold text-white">Publications</h2>
            {posts.length === 0 && <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-sm text-zinc-400">Aucune publication publique pour le moment.</p>}
            {posts.map((post) => (
              <article key={post.post_id} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6">
                <time dateTime={post.created_at} className="text-xs text-zinc-500">{formatDate(post.created_at)}</time>
                <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">{post.body}</p>
                {post.image_url && (
                  <Image
                    src={post.image_url}
                    alt="Image de la publication"
                    width={1200}
                    height={900}
                    unoptimized
                    className="mt-4 max-h-[32rem] w-full rounded-xl border border-zinc-800 object-contain"
                  />
                )}
                <p className="mt-4 border-t border-zinc-800 pt-3 text-sm text-zinc-400">👍 {post.like_count} · Commentaires {post.comment_count}</p>
              </article>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
