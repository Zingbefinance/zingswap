"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import ReportForm from "../../_components/ReportForm";
import { getCommunityErrorMessage } from "@/lib/community/errors";
import { createClient } from "@/lib/supabase/client";

type FeedPost = {
  post_id: string;
  body: string;
  created_at: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  image_path: string | null;
  image_url: string | null;
  like_count: number;
  comment_count: number;
};

type FeedComment = {
  comment_id: string;
  post_id: string;
  body: string;
  created_at: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
};

type FeedState = "loading" | "empty" | "error" | "ready";

const POST_IMAGE_BUCKET = "community-post-images";
const MAX_POST_IMAGE_SIZE = 5 * 1024 * 1024;
const ALLOWED_POST_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const POST_EMOJIS = ["❤️", "😂", "😍", "👍", "🙏", "🔥", "🎉", "😊", "💪", "🚀", "😢", "👏"];
const POST_REACTIONS = ["👍", "🥲", "🎉", "🎊", "💞", "🤣", "😭", "😎", "🤔", "😂", "😅", "🥰", "😍", "🤩", "🔥"] as const;
type PostReaction = (typeof POST_REACTIONS)[number];

function isPostReaction(value: string): value is PostReaction {
  return POST_REACTIONS.includes(value as PostReaction);
}

function getInitials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

type FeedPostSource = Omit<FeedPost, "image_url" | "like_count" | "comment_count">;

async function loadPublicFeedRows(supabase: ReturnType<typeof createClient>): Promise<FeedPostSource[]> {
  const withUsername = await supabase
    .from("community_public_feed")
    .select("post_id, body, created_at, display_name, avatar_url, image_path, username")
    .order("created_at", { ascending: false });
  if (!withUsername.error) return (withUsername.data ?? []) as unknown as FeedPostSource[];

  const withAvatar = await supabase
    .from("community_public_feed")
    .select("post_id, body, created_at, display_name, avatar_url, image_path")
    .order("created_at", { ascending: false });
  if (!withAvatar.error) {
    return ((withAvatar.data ?? []) as unknown as Array<Omit<FeedPostSource, "username">>)
      .map((post) => ({ ...post, username: null }));
  }

  const legacy = await supabase
    .from("community_public_feed")
    .select("post_id, body, created_at, display_name, image_path")
    .order("created_at", { ascending: false });
  if (legacy.error) throw legacy.error;
  return ((legacy.data ?? []) as unknown as Array<Omit<FeedPostSource, "username" | "avatar_url">>)
    .map((post) => ({ ...post, username: null, avatar_url: null }));
}

async function loadPublicComments(
  supabase: ReturnType<typeof createClient>,
  postId: string,
): Promise<FeedComment[]> {
  const withProfile = await supabase
    .from("community_public_comments")
    .select("comment_id, post_id, body, created_at, display_name, username, avatar_url")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (!withProfile.error) return (withProfile.data ?? []) as unknown as FeedComment[];

  const withAvatar = await supabase
    .from("community_public_comments")
    .select("comment_id, post_id, body, created_at, display_name, avatar_url")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (!withAvatar.error) {
    return ((withAvatar.data ?? []) as unknown as Array<Omit<FeedComment, "username">>)
      .map((comment) => ({ ...comment, username: null }));
  }

  const legacy = await supabase
    .from("community_public_comments")
    .select("comment_id, post_id, body, created_at, display_name")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (legacy.error) throw legacy.error;
  return ((legacy.data ?? []) as unknown as Array<Omit<FeedComment, "username" | "avatar_url">>)
    .map((comment) => ({ ...comment, username: null, avatar_url: null }));
}

export default function FeedClient() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [feedState, setFeedState] = useState<FeedState>("loading");
  const [feedError, setFeedError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [reactionsByPost, setReactionsByPost] = useState<Record<string, PostReaction>>({});
  const [supportsPostReactions, setSupportsPostReactions] = useState(false);
  const [body, setBody] = useState("");
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const postBodyRef = useRef<HTMLTextAreaElement>(null);
  const postSelectionRef = useRef({ start: 0, end: 0 });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [postMessage, setPostMessage] = useState("");
  const [postError, setPostError] = useState("");
  const [openCommentPostId, setOpenCommentPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, FeedComment[]>>({});
  const [commentsLoadingPostId, setCommentsLoadingPostId] = useState<string | null>(null);
  const [commentsErrorPostId, setCommentsErrorPostId] = useState<string | null>(null);
  const [commentsError, setCommentsError] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [openCommentEmojiPostId, setOpenCommentEmojiPostId] = useState<string | null>(null);
  const commentTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const commentSelectionRefs = useRef<Record<string, { start: number; end: number }>>({});
  const [commentBusyPostId, setCommentBusyPostId] = useState<string | null>(null);
  const [commentMessages, setCommentMessages] = useState<Record<string, string>>({});
  const [commentErrors, setCommentErrors] = useState<Record<string, string>>({});
  const [busyReactionPostIds, setBusyReactionPostIds] = useState<Set<string>>(new Set());
  const busyReactionPostIdsRef = useRef(new Set<string>());
  const [reactionErrors, setReactionErrors] = useState<Record<string, string>>({});
  const [openReactionPickerPostId, setOpenReactionPickerPostId] = useState<string | null>(null);
  const reactionPickerToggleRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  function rememberPostSelection() {
    const textarea = postBodyRef.current;
    if (!textarea) return;
    postSelectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }

  function insertPostEmoji(emoji: string) {
    const { start, end } = postSelectionRef.current;
    const remainingCharacters = 5000 - (body.length - (end - start));
    if (emoji.length > remainingCharacters) return;

    const nextBody = `${body.slice(0, start)}${emoji}${body.slice(end)}`;
    const nextCaret = start + emoji.length;
    setBody(nextBody);
    setIsEmojiPickerOpen(false);
    requestAnimationFrame(() => {
      const textarea = postBodyRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
      postSelectionRef.current = { start: nextCaret, end: nextCaret };
    });
  }

  function rememberCommentSelection(postId: string) {
    const textarea = commentTextareaRefs.current[postId];
    if (!textarea) return;
    commentSelectionRefs.current[postId] = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
  }

  function insertCommentEmoji(postId: string, emoji: string) {
    const draft = commentDrafts[postId] ?? "";
    const { start, end } = commentSelectionRefs.current[postId] ?? {
      start: draft.length,
      end: draft.length,
    };
    const remainingCharacters = 2000 - (draft.length - (end - start));
    if (emoji.length > remainingCharacters) return;

    const nextDraft = `${draft.slice(0, start)}${emoji}${draft.slice(end)}`;
    const nextCaret = start + emoji.length;
    setCommentDrafts((current) => ({ ...current, [postId]: nextDraft }));
    setOpenCommentEmojiPostId(null);
    requestAnimationFrame(() => {
      const textarea = commentTextareaRefs.current[postId];
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
      commentSelectionRefs.current[postId] = { start: nextCaret, end: nextCaret };
    });
  }

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [imageFile]);

  useEffect(() => {
    let isActive = true;

    async function loadFeed() {
      try {
        setFeedError("");
        const supabase = createClient();
        const engagementRequest = supabase
          .from("community_public_engagement")
          .select("post_id, like_count, comment_count");
        const userRequest = supabase.auth.getUser();

        const [feedRows, engagementResult, userResult] = await Promise.all([
          loadPublicFeedRows(supabase),
          engagementRequest,
          userRequest,
        ]);

        if (!isActive) return;
        const currentUserId = userResult.error ? null : userResult.data.user?.id ?? null;
        setUserId(currentUserId);
        setAuthError(userResult.error
          ? getCommunityErrorMessage(userResult.error, "La session Community n’a pas pu être vérifiée")
          : "");
        if (engagementResult.error) throw engagementResult.error;

        const currentReactions: Record<string, PostReaction> = {};
        let hasReactionSupport = false;
        if (currentUserId) {
          const reactionResult = await supabase.rpc("list_my_reactions");
          if (!reactionResult.error) {
            hasReactionSupport = true;
            const reactionRows = (reactionResult.data ?? []) as Array<{ post_id: string; reaction_type: string }>;
            for (const row of reactionRows) {
              if (isPostReaction(row.reaction_type)) currentReactions[row.post_id] = row.reaction_type;
            }
          } else {
            const legacyLikes = await supabase.rpc("list_my_liked_posts");
            if (legacyLikes.error) throw legacyLikes.error;
            for (const row of (legacyLikes.data ?? []) as Array<{ post_id: string }>) {
              currentReactions[row.post_id] = "👍";
            }
          }
        }

        if (!isActive) return;
        const engagementByPost = new Map(
          (engagementResult.data ?? []).map((row) => [
            row.post_id as string,
            {
              likeCount: Number(row.like_count),
              commentCount: Number(row.comment_count),
            },
          ]),
        );
        const loadedPosts = feedRows.map((post) => ({
            ...post,
            image_url: post.image_path
              ? supabase.storage.from(POST_IMAGE_BUCKET).getPublicUrl(post.image_path).data.publicUrl
              : null,
            like_count: engagementByPost.get(post.post_id)?.likeCount ?? 0,
            comment_count: engagementByPost.get(post.post_id)?.commentCount ?? 0,
          }));

        setPosts(loadedPosts);
        setReactionsByPost(currentReactions);
        setSupportsPostReactions(hasReactionSupport);
        setFeedState(loadedPosts.length ? "ready" : "empty");
      } catch (error) {
        if (isActive) {
          setFeedError(getCommunityErrorMessage(error, "Le fil Community est indisponible"));
          setFeedState("error");
        }
      }
    }

    void loadFeed();
    return () => {
      isActive = false;
    };
  }, []);

  async function submitPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPostMessage("");
    setPostError("");

    const trimmedBody = body.trim();
    if (!trimmedBody || trimmedBody.length > 5000) {
      setPostError("La publication doit contenir entre 1 et 5 000 caractères.");
      return;
    }
    if (imageFile && !ALLOWED_POST_IMAGE_TYPES.includes(imageFile.type)) {
      setPostError("Choisis une image JPEG, PNG ou WebP.");
      return;
    }
    if (imageFile && imageFile.size > MAX_POST_IMAGE_SIZE) {
      setPostError("L’image ne doit pas dépasser 5 Mo.");
      return;
    }

    setIsSubmittingPost(true);
    let uploadedImagePath: string | null = null;
    try {
      const supabase = createClient();
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError || !userResult.user) {
        setUserId(null);
        setAuthError(userError
          ? getCommunityErrorMessage(userError, "La session Community n’a pas pu être vérifiée")
          : "Aucun utilisateur Community n’est connecté.");
        setPostError("La session n’a pas pu être vérifiée. Reconnecte-toi puis réessaie.");
        return;
      }

      const verifiedUserId = userResult.user.id;
      setUserId(verifiedUserId);
      setAuthError("");

      if (imageFile) {
        const extension = imageFile.type === "image/jpeg" ? "jpg" : imageFile.type.split("/")[1];
        const imagePath = `${verifiedUserId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(POST_IMAGE_BUCKET)
          .upload(imagePath, imageFile, {
            cacheControl: "3600",
            contentType: imageFile.type,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        uploadedImagePath = imagePath;
      }

      const authorId = verifiedUserId;
      const projectId: string | null = null;
      const imagePathForPost = uploadedImagePath;

      if (process.env.NODE_ENV === "development") {
        let role: string | null = null;
        let jwtSubMatchesUser = false;
        const { data: sessionResult } = await supabase.auth.getSession();
        const accessToken = sessionResult.session?.access_token;
        const encodedPayload = accessToken?.split(".")[1];

        if (encodedPayload) {
          try {
            const base64Payload = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
            const paddedPayload = base64Payload.padEnd(Math.ceil(base64Payload.length / 4) * 4, "=");
            const jwtPayload = JSON.parse(atob(paddedPayload)) as { role?: unknown; sub?: unknown };
            role = typeof jwtPayload.role === "string" ? jwtPayload.role : null;
            jwtSubMatchesUser = typeof jwtPayload.sub === "string" && jwtPayload.sub === verifiedUserId;
          } catch {
            // Keep the diagnostic limited to its requested fields if the payload is unreadable.
          }
        }

        console.info("[Community] Diagnostic RLS avant publication", {
          role,
          jwtSubMatchesUser,
          authorMatchesUser: authorId === verifiedUserId,
          projectIdIsNull: projectId === null,
          imagePathIsNull: imagePathForPost === null,
        });
      }

      const { error } = await supabase
        .from("posts")
        .insert({
          author_id: authorId,
          project_id: projectId,
          body: trimmedBody,
          image_path: imagePathForPost,
          status: "published",
        });

      if (error) throw error;

      setBody("");
      setImageFile(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      setPostMessage("Publication publiée dans le fil.");
      const [feedRows, engagementResult] = await Promise.all([
        loadPublicFeedRows(supabase),
        supabase
          .from("community_public_engagement")
          .select("post_id, like_count, comment_count"),
      ]);

      if (engagementResult.error) {
        const refreshError = engagementResult.error;
        setFeedError(getCommunityErrorMessage(refreshError, "Le fil Community n’a pas pu être actualisé"));
        setFeedState("error");
      } else {
        const engagementByPost = new Map(
          (engagementResult.data ?? []).map((row) => [
            row.post_id as string,
            {
              likeCount: Number(row.like_count),
              commentCount: Number(row.comment_count),
            },
          ]),
        );
        const refreshedPosts = feedRows.map((post) => ({
            ...post,
            image_url: post.image_path
              ? supabase.storage.from(POST_IMAGE_BUCKET).getPublicUrl(post.image_path).data.publicUrl
              : null,
            like_count: engagementByPost.get(post.post_id)?.likeCount ?? 0,
            comment_count: engagementByPost.get(post.post_id)?.commentCount ?? 0,
          }));

        setPosts(refreshedPosts);
        setFeedError("");
        setFeedState(refreshedPosts.length ? "ready" : "empty");
      }
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        const fields = error && typeof error === "object"
          ? error as { code?: unknown; message?: unknown; status?: unknown; statusCode?: unknown }
          : {};
        if (fields.code === "42501") {
          const safeMessage = typeof fields.message === "string"
            && /^new row violates row-level security policy for table "[a-zA-Z0-9_]+"$/.test(fields.message)
            ? fields.message
            : "Supabase a refusé l’opération selon les permissions ou la politique RLS.";
          console.warn("[Community] Refus de publication 42501", {
            operation: "posts.insert",
            status: fields.status ?? fields.statusCode ?? null,
            message: safeMessage,
          });
        }
      }

      if (uploadedImagePath) {
        let cleanupFailed = false;
        try {
          const { error: cleanupError } = await createClient().storage
            .from(POST_IMAGE_BUCKET)
            .remove([uploadedImagePath]);
          cleanupFailed = Boolean(cleanupError);
        } catch {
          cleanupFailed = true;
        }
        const reason = getCommunityErrorMessage(error, "La publication a échoué");
        setPostError(cleanupFailed
          ? `${reason} Le nettoyage de l’image n’a pas pu être confirmé.`
          : `${reason} L’image temporaire a été supprimée.`);
      } else {
        setPostError(getCommunityErrorMessage(error, "La publication n’a pas pu être envoyée"));
      }
    } finally {
      setIsSubmittingPost(false);
    }
  }

  function selectPostImage(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.currentTarget.files?.[0] ?? null;
    setPostError("");
    if (selectedFile && !ALLOWED_POST_IMAGE_TYPES.includes(selectedFile.type)) {
      setImageFile(null);
      setPostError("Choisis une image JPEG, PNG ou WebP.");
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    if (selectedFile && selectedFile.size > MAX_POST_IMAGE_SIZE) {
      setImageFile(null);
      setPostError("L’image ne doit pas dépasser 5 Mo.");
      if (imageInputRef.current) imageInputRef.current.value = "";
      return;
    }
    setImageFile(selectedFile);
  }

  async function setPostReaction(postId: string, selectedReaction: PostReaction) {
    if (busyReactionPostIdsRef.current.has(postId)) return;
    busyReactionPostIdsRef.current.add(postId);
    setBusyReactionPostIds((current) => new Set(current).add(postId));
    setReactionErrors((current) => ({ ...current, [postId]: "" }));

    const currentReaction = reactionsByPost[postId] ?? null;
    const nextReaction = currentReaction === selectedReaction ? null : selectedReaction;

    try {
      const supabase = createClient();
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const currentUserId = userResult.user?.id;
      if (!currentUserId) {
        setUserId(null);
        throw new Error("Connecte-toi pour réagir à une publication.");
      }
      setUserId(currentUserId);

      if (!supportsPostReactions && !currentReaction && nextReaction) {
        const { error } = await supabase
          .from("likes")
          .insert({ user_id: currentUserId, post_id: postId });
        if (error && error.code !== "23505") throw error;
      } else if (!supportsPostReactions && currentReaction) {
        const { error } = await supabase
          .from("likes")
          .delete()
          .eq("post_id", postId);
        if (error) throw error;
      } else if (!currentReaction && nextReaction) {
        const { error } = await supabase
          .from("likes")
          .insert({ user_id: currentUserId, post_id: postId, reaction_type: nextReaction });
        if (error?.code === "23505") {
          const { error: updateError } = await supabase
            .from("likes")
            .update({ reaction_type: nextReaction })
            .eq("post_id", postId);
          if (updateError) throw updateError;
        } else if (error) {
          throw error;
        }
      } else if (currentReaction && nextReaction) {
        const { error } = await supabase
          .from("likes")
          .update({ reaction_type: nextReaction })
          .eq("post_id", postId);
        if (error) throw error;
      } else if (currentReaction) {
        const { error } = await supabase
          .from("likes")
          .delete()
          .eq("post_id", postId);
        if (error) throw error;
      }

      setReactionsByPost((current) => {
        const next = { ...current };
        if (nextReaction) next[postId] = nextReaction;
        else delete next[postId];
        return next;
      });
      setPosts((current) => current.map((post) =>
        post.post_id === postId
          ? {
              ...post,
              like_count: Math.max(
                0,
                post.like_count + (!currentReaction && nextReaction ? 1 : currentReaction && !nextReaction ? -1 : 0),
              ),
            }
          : post,
      ));

      const [engagementResult, reactionsResult] = await Promise.all([
        supabase
          .from("community_public_engagement")
          .select("like_count")
          .eq("post_id", postId)
          .maybeSingle(),
        supportsPostReactions
          ? supabase.rpc("list_my_reactions")
          : supabase.rpc("list_my_liked_posts"),
      ]);
      if (!reactionsResult.error) {
        const reactionRows = (reactionsResult.data ?? []) as Array<{ post_id: string; reaction_type?: string }>;
        const refreshedReaction = reactionRows.find((row) => row.post_id === postId);
        setReactionsByPost((current) => {
          const next = { ...current };
          if (!supportsPostReactions && refreshedReaction) {
            next[postId] = "👍";
          } else if (refreshedReaction?.reaction_type && isPostReaction(refreshedReaction.reaction_type)) {
            next[postId] = refreshedReaction.reaction_type;
          } else {
            delete next[postId];
          }
          return next;
        });
      }
      if (!engagementResult.error && engagementResult.data) {
        setPosts((current) => current.map((post) =>
          post.post_id === postId
            ? { ...post, like_count: Number(engagementResult.data?.like_count ?? 0) }
            : post,
        ));
      }
      if (reactionsResult.error || engagementResult.error) {
        setReactionErrors((current) => ({
          ...current,
          [postId]: "Réaction enregistrée, mais son affichage n’a pas pu être actualisé. Recharge la page.",
        }));
      }
    } catch (error) {
      setReactionErrors((current) => ({
        ...current,
        [postId]: getCommunityErrorMessage(error, "Impossible d’enregistrer la réaction"),
      }));
    } finally {
      busyReactionPostIdsRef.current.delete(postId);
      setBusyReactionPostIds((current) => {
        const next = new Set(current);
        next.delete(postId);
        return next;
      });
    }
  }

  async function toggleComments(postId: string) {
    if (openCommentPostId === postId) {
      setOpenCommentPostId(null);
      return;
    }
    setOpenCommentPostId(postId);
    if (Object.hasOwn(commentsByPost, postId)) return;

    setCommentsLoadingPostId(postId);
    setCommentsErrorPostId(null);
    setCommentsError("");
    try {
      const supabase = createClient();
      const data = await loadPublicComments(supabase, postId);
      setCommentsByPost((current) => ({
        ...current,
        [postId]: data,
      }));
    } catch (error) {
      setCommentsErrorPostId(postId);
      setCommentsError(getCommunityErrorMessage(error, "Les commentaires sont indisponibles"));
    } finally {
      setCommentsLoadingPostId(null);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault();
    setCommentMessages((current) => ({ ...current, [postId]: "" }));
    setCommentErrors((current) => ({ ...current, [postId]: "" }));
    const trimmedBody = (commentDrafts[postId] ?? "").trim();

    if (!userId) {
      setCommentErrors((current) => ({ ...current, [postId]: "Connecte-toi pour commenter." }));
      return;
    }
    if (!trimmedBody || trimmedBody.length > 2000) {
      setCommentErrors((current) => ({ ...current, [postId]: "Le commentaire doit contenir entre 1 et 2 000 caractères." }));
      return;
    }
    setCommentBusyPostId(postId);
    try {
      const supabase = createClient();
      const { data: insertedComment, error } = await supabase
        .from("comments")
        .insert({
          post_id: postId,
          author_id: userId,
          body: trimmedBody,
          status: "published",
        })
        .select("id")
        .single();
      if (error) throw error;

      setCommentDrafts((current) => ({ ...current, [postId]: "" }));
      setCommentMessages((current) => ({
        ...current,
        [postId]: "Commentaire publié.",
      }));
      const refreshedComments = await loadPublicComments(supabase, postId);
      if (refreshedComments.some((comment) => comment.comment_id === insertedComment.id)) {
        setCommentsByPost((current) => ({
          ...current,
          [postId]: refreshedComments,
        }));
      }
      const { data: engagement } = await supabase
        .from("community_public_engagement")
        .select("comment_count")
        .eq("post_id", postId)
        .maybeSingle();
      if (engagement) {
        setPosts((current) => current.map((post) =>
          post.post_id === postId ? { ...post, comment_count: Number(engagement.comment_count) } : post,
        ));
      }
    } catch (error) {
      setCommentErrors((current) => ({
        ...current,
        [postId]: getCommunityErrorMessage(error, "Le commentaire n’a pas pu être envoyé"),
      }));
    } finally {
      setCommentBusyPostId(null);
    }
  }

  return (
    <section aria-label="Fil d’actualité" className="space-y-4">
      {userId ? (
        <form
          onSubmit={submitPost}
          className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6"
        >
          <label htmlFor="community-post-content" className="sr-only">
            Rédiger une publication
          </label>
          <textarea
            ref={postBodyRef}
            id="community-post-content"
            required
            maxLength={5000}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              rememberPostSelection();
            }}
            onSelect={rememberPostSelection}
            onBlur={rememberPostSelection}
            placeholder="Que souhaitez-vous partager ?"
            className="min-h-24 w-full resize-y rounded-xl border border-zinc-800 bg-black/40 p-3 text-sm text-white placeholder:text-zinc-600"
          />
          {imagePreviewUrl && (
            <div className="mt-3 rounded-xl border border-zinc-800 bg-black/30 p-3">
              <p className="mb-2 text-xs font-medium text-zinc-400">Aperçu de l’image</p>
              <Image
                src={imagePreviewUrl}
                alt="Aperçu de l’image sélectionnée"
                width={1200}
                height={800}
                unoptimized
                className="max-h-80 w-full rounded-lg object-contain"
              />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-cyan-400">
              Ajouter une image
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={selectPostImage}
                disabled={isSubmittingPost}
                className="sr-only"
              />
            </label>
            <button
              type="button"
              aria-expanded={isEmojiPickerOpen}
              aria-controls="community-post-emoji-picker"
              onClick={() => {
                rememberPostSelection();
                setIsEmojiPickerOpen((open) => !open);
              }}
              disabled={isSubmittingPost}
              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-cyan-400 disabled:opacity-50"
            >
              😊 Emojis
            </button>
            <span className="text-xs text-zinc-500">JPEG, PNG ou WebP · 5 Mo maximum · image publique</span>
            {imageFile && (
              <span className="flex items-center gap-2 text-sm text-zinc-300">
                {imageFile.name}
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    if (imageInputRef.current) imageInputRef.current.value = "";
                  }}
                  disabled={isSubmittingPost}
                  aria-label="Retirer l’image sélectionnée"
                  className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  Retirer
                </button>
              </span>
            )}
          </div>
          {isEmojiPickerOpen && (
            <div
              id="community-post-emoji-picker"
              role="group"
              aria-label="Choisir un emoji"
              className="mt-3 flex flex-wrap gap-2 rounded-xl border border-zinc-800 bg-black/40 p-3"
            >
              {POST_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => insertPostEmoji(emoji)}
                  disabled={isSubmittingPost}
                  aria-label={`Insérer ${emoji}`}
                  className="rounded-lg px-2 py-1 text-xl hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-zinc-500">Les publications sont visibles immédiatement et peuvent être modérées.</span>
            <button
              type="submit"
              disabled={isSubmittingPost || !body.trim()}
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmittingPost ? "Envoi…" : "Publier"}
            </button>
          </div>
          {postError && <p role="alert" className="mt-3 text-sm text-red-300">{postError}</p>}
          {postMessage && <p role="status" className="mt-3 text-sm text-emerald-300">{postMessage}</p>}
        </form>
      ) : feedState !== "loading" ? (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">
          {authError && <span className="mb-2 block text-amber-200">{authError}</span>}
          <Link href="/community/login" className="text-cyan-300 hover:text-cyan-200">
            Connecte-toi
          </Link>{" "}
          pour publier, aimer ou commenter.
        </p>
      ) : null}

      {feedState === "loading" && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center text-zinc-400"
        >
          <span
            aria-hidden="true"
            className="mx-auto mb-3 block h-6 w-6 animate-spin rounded-full border-2 border-zinc-700 border-t-cyan-300"
          />
          Chargement du fil…
        </div>
      )}

      {feedState === "error" && (
        <div role="alert" className="rounded-2xl border border-red-900/70 bg-zinc-950 p-6 text-center">
          <p className="font-semibold text-red-200">Fil indisponible</p>
          <p className="mt-2 text-sm text-zinc-400">
            {feedError || "Impossible de charger les publications et leurs interactions."}
          </p>
        </div>
      )}

      {feedState === "empty" && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-8 text-center">
          <p className="font-semibold text-white">Aucune publication pour le moment</p>
          <p className="mt-2 text-sm text-zinc-400">Les nouvelles publications apparaîtront ici.</p>
        </div>
      )}

      {feedState === "ready" && posts.map((post) => (
        <article
          key={post.post_id}
          className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6"
        >
          <header className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-300/20 bg-cyan-300/10 text-sm font-semibold text-cyan-200">
              {post.avatar_url ? (
                <Image
                  src={post.avatar_url}
                  alt={`Photo de profil de ${post.display_name}`}
                  width={44}
                  height={44}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : (
                <span aria-hidden="true">{getInitials(post.display_name)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              {post.username ? (
                <Link
                  href={`/community/members/${encodeURIComponent(post.username)}`}
                  className="inline-block font-semibold text-white hover:underline focus-visible:underline"
                >
                  {post.display_name}
                </Link>
              ) : (
                <span className="inline-block font-semibold text-white">{post.display_name}</span>
              )}
              <time dateTime={post.created_at} className="mt-0.5 block text-sm text-zinc-500">
                {formatDate(post.created_at)}
              </time>
            </div>
          </header>

          <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-300 sm:text-base">
            {post.body}
          </p>
          {post.image_url && (
            <Image
              src={post.image_url}
              alt={`Image jointe à la publication de ${post.display_name}`}
              loading="lazy"
              width={1200}
              height={800}
              unoptimized
              className="mt-4 max-h-[32rem] w-full rounded-xl border border-zinc-800 object-contain"
            />
          )}

          <footer className="mt-5 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4">
            {userId ? (
              supportsPostReactions ? <div className="relative flex items-center gap-1">
                <button
                  type="button"
                  disabled={busyReactionPostIds.has(post.post_id)}
                  onClick={() => void setPostReaction(post.post_id, reactionsByPost[post.post_id] ?? "👍")}
                  aria-pressed={Boolean(reactionsByPost[post.post_id])}
                  aria-label={reactionsByPost[post.post_id]
                    ? `Retirer votre réaction ${reactionsByPost[post.post_id]}`
                    : "J’aime cette publication avec 👍"}
                  className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                >
                  <span aria-hidden="true" className="mr-1">{reactionsByPost[post.post_id] ?? "👍"}</span>
                  {reactionsByPost[post.post_id] ? "Réagi" : "J’aime"} · {post.like_count}
                </button>
                <button
                  ref={(button) => { reactionPickerToggleRefs.current[post.post_id] = button; }}
                  type="button"
                  disabled={busyReactionPostIds.has(post.post_id)}
                  onClick={() => setOpenReactionPickerPostId((current) =>
                    current === post.post_id ? null : post.post_id,
                  )}
                  aria-label="Ouvrir la palette des réactions"
                  aria-expanded={openReactionPickerPostId === post.post_id}
                  aria-controls={`reaction-picker-${post.post_id}`}
                  className="rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300 hover:border-cyan-400 disabled:opacity-50"
                >
                  ☺️ <span className="hidden sm:inline">Réagir</span>
                </button>
                {openReactionPickerPostId === post.post_id && (
                  <div
                    id={`reaction-picker-${post.post_id}`}
                    role="group"
                    aria-label="Choisir une réaction"
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setOpenReactionPickerPostId(null);
                        reactionPickerToggleRefs.current[post.post_id]?.focus();
                      }
                    }}
                    className="absolute bottom-full left-0 z-20 mb-2 grid max-w-[calc(100vw-3rem)] grid-cols-5 gap-1 rounded-xl border border-zinc-700 bg-zinc-950 p-2 shadow-xl"
                  >
                    {POST_REACTIONS.map((reaction) => (
                      <button
                        key={reaction}
                        type="button"
                        disabled={busyReactionPostIds.has(post.post_id)}
                        onClick={() => {
                          setOpenReactionPickerPostId(null);
                          requestAnimationFrame(() => reactionPickerToggleRefs.current[post.post_id]?.focus());
                          void setPostReaction(post.post_id, reaction);
                        }}
                        aria-label={`Réagir ${reaction}`}
                        aria-pressed={reactionsByPost[post.post_id] === reaction}
                        className="flex h-10 w-10 items-center justify-center rounded-lg text-2xl hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-50"
                      >
                        {reaction}
                      </button>
                    ))}
                  </div>
                )}
              </div> : (
                <button
                  type="button"
                  disabled={busyReactionPostIds.has(post.post_id)}
                  onClick={() => void setPostReaction(post.post_id, "👍")}
                  aria-pressed={Boolean(reactionsByPost[post.post_id])}
                  className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900 disabled:opacity-50"
                >
                  J’aime · {post.like_count}
                </button>
              )
            ) : (
              <Link href="/community/login" className="rounded-lg px-3 py-2 text-sm text-zinc-500 hover:text-zinc-300">
                J’aime · {post.like_count}
              </Link>
            )}
            <button
              type="button"
              onClick={() => void toggleComments(post.post_id)}
              aria-expanded={openCommentPostId === post.post_id}
              className="rounded-lg px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              Commenter · {post.comment_count}
            </button>
            <ReportForm userId={userId} targetType="post" targetId={post.post_id} />
          </footer>
          {reactionErrors[post.post_id] && <p role="alert" className="mt-2 text-sm text-red-300">{reactionErrors[post.post_id]}</p>}

          {openCommentPostId === post.post_id && (
            <div className="mt-4 space-y-4 border-t border-zinc-800 pt-4">
              {commentsLoadingPostId === post.post_id && (
                <p role="status" className="text-sm text-zinc-400">Chargement des commentaires…</p>
              )}
              {commentsErrorPostId === post.post_id && (
                <p role="alert" className="text-sm text-red-300">{commentsError || "Impossible de charger les commentaires."}</p>
              )}
              {(commentsByPost[post.post_id] ?? []).map((comment) => (
                <article key={comment.comment_id} className="rounded-xl bg-black/30 p-3">
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="inline-flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-300/20 bg-cyan-300/10 text-[10px] font-semibold text-cyan-200">
                        {comment.avatar_url ? (
                          <Image
                            src={comment.avatar_url}
                            alt={`Photo de profil de ${comment.display_name}`}
                            width={28}
                            height={28}
                            unoptimized
                            className="h-full w-full rounded-full object-cover"
                          />
                        ) : (
                          <span aria-hidden="true">{getInitials(comment.display_name)}</span>
                        )}
                      </span>
                      {comment.username ? (
                        <Link
                          href={`/community/members/${encodeURIComponent(comment.username)}`}
                          className="text-sm font-medium text-white hover:underline focus-visible:underline"
                        >
                          {comment.display_name}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-white">{comment.display_name}</span>
                      )}
                    </span>
                    <time dateTime={comment.created_at} className="text-xs text-zinc-500">
                      {formatDate(comment.created_at)}
                    </time>
                  </header>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{comment.body}</p>
                  <div className="mt-2">
                    <ReportForm userId={userId} targetType="comment" targetId={comment.comment_id} />
                  </div>
                </article>
              ))}
              {Object.hasOwn(commentsByPost, post.post_id) && commentsByPost[post.post_id].length === 0 && (
                <p className="text-sm text-zinc-500">Aucun commentaire publié pour le moment.</p>
              )}
              {userId ? (
                <form onSubmit={(event) => void submitComment(event, post.post_id)} className="space-y-2">
                  <label htmlFor={`comment-${post.post_id}`} className="sr-only">Écrire un commentaire</label>
                  <textarea
                    ref={(textarea) => { commentTextareaRefs.current[post.post_id] = textarea; }}
                    id={`comment-${post.post_id}`}
                    required
                    maxLength={2000}
                    value={commentDrafts[post.post_id] ?? ""}
                    onChange={(event) => {
                      setCommentDrafts((current) => ({ ...current, [post.post_id]: event.target.value }));
                      rememberCommentSelection(post.post_id);
                    }}
                    onSelect={() => rememberCommentSelection(post.post_id)}
                    onBlur={() => rememberCommentSelection(post.post_id)}
                    placeholder="Écrire un commentaire…"
                    className="min-h-20 w-full resize-y rounded-xl border border-zinc-800 bg-black/40 p-3 text-sm text-white placeholder:text-zinc-600"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      aria-expanded={openCommentEmojiPostId === post.post_id}
                      aria-controls={`comment-emoji-picker-${post.post_id}`}
                      onClick={() => {
                        rememberCommentSelection(post.post_id);
                        setOpenCommentEmojiPostId((current) => current === post.post_id ? null : post.post_id);
                      }}
                      disabled={commentBusyPostId === post.post_id}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:border-cyan-400 disabled:opacity-50"
                    >
                      😊 Emojis
                    </button>
                    <button
                      type="submit"
                      disabled={commentBusyPostId === post.post_id || !(commentDrafts[post.post_id] ?? "").trim()}
                      className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {commentBusyPostId === post.post_id ? "Envoi…" : "Publier le commentaire"}
                    </button>
                  </div>
                  {openCommentEmojiPostId === post.post_id && (
                    <div
                      id={`comment-emoji-picker-${post.post_id}`}
                      role="group"
                      aria-label="Choisir un emoji pour le commentaire"
                      className="flex flex-wrap gap-2 rounded-xl border border-zinc-800 bg-black/40 p-3"
                    >
                      {POST_EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => insertCommentEmoji(post.post_id, emoji)}
                          disabled={commentBusyPostId === post.post_id}
                          aria-label={`Insérer ${emoji}`}
                          className="rounded-lg px-2 py-1 text-xl hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                  {commentErrors[post.post_id] && <p role="alert" className="text-sm text-red-300">{commentErrors[post.post_id]}</p>}
                  {commentMessages[post.post_id] && <p role="status" className="text-sm text-emerald-300">{commentMessages[post.post_id]}</p>}
                </form>
              ) : (
                <p className="text-sm text-zinc-400">
                  <Link href="/community/login" className="text-cyan-300 hover:text-cyan-200">Connecte-toi</Link>{" "}
                  pour commenter.
                </p>
              )}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
