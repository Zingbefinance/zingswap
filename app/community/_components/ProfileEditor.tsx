"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";

import { profileSchema } from "@/lib/community/schemas";
import { getCommunityErrorMessage } from "@/lib/community/errors";
import { createClient } from "@/lib/supabase/client";

type ProfileEditorProps = {
  userId: string;
  username: string;
  displayName: string;
  bio: string;
};

const AVATAR_BUCKET = "community-avatars";
const MAX_AVATAR_SIZE = 2 * 1024 * 1024;
const AVATAR_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export default function ProfileEditor({ userId, username, displayName, bio }: ProfileEditorProps) {
  const [values, setValues] = useState({ username, displayName, bio });
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    async function loadAvatar() {
      try {
        const supabase = createClient();
        const { data, error: loadError } = await supabase
          .from("profiles")
          .select("avatar_url")
          .eq("user_id", userId)
          .maybeSingle();
        if (active && !loadError) {
          setAvatarUrl(typeof data?.avatar_url === "string" ? data.avatar_url : null);
        }
      } catch {
        // The profile editor remains usable if the existing avatar cannot be loaded.
      }
    }
    void loadAvatar();
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(avatarFile);
    setAvatarPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [avatarFile]);

  function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    setMessage("");
    const file = event.currentTarget.files?.[0] ?? null;
    if (!file) {
      setAvatarFile(null);
      return;
    }
    if (!Object.hasOwn(AVATAR_EXTENSIONS, file.type)) {
      setAvatarFile(null);
      event.currentTarget.value = "";
      setError("Choisis une image JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarFile(null);
      event.currentTarget.value = "";
      setError("La photo ne doit pas dépasser 2 Mo.");
      return;
    }
    setError("");
    setAvatarFile(file);
  }

  function getOwnedAvatarPath(supabase: ReturnType<typeof createClient>, publicUrl: string) {
    try {
      const expected = new URL(
        supabase.storage.from(AVATAR_BUCKET).getPublicUrl("avatar-validation").data.publicUrl,
      );
      const candidate = new URL(publicUrl);
      const bucketRoot = expected.pathname.slice(0, expected.pathname.lastIndexOf("/") + 1);
      if (candidate.origin !== expected.origin || !candidate.pathname.startsWith(bucketRoot)
        || candidate.search || candidate.hash) return null;

      const objectPath = decodeURIComponent(candidate.pathname.slice(bucketRoot.length));
      const segments = objectPath.split("/");
      if (segments.length !== 2 || segments[0] !== userId || !segments[1]
        || segments[1] === "." || segments[1] === "..") return null;
      return objectPath;
    } catch {
      return null;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Vérifie les informations du profil.");
      return;
    }

    setPending(true);
    let supabase: ReturnType<typeof createClient> | null = null;
    let uploadedAvatarPath: string | null = null;
    let profileSaved = false;
    try {
      supabase = createClient();
      let uploadedAvatarUrl: string | null = null;

      if (avatarFile) {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError || !authData.user) {
          setError(authError
            ? getCommunityErrorMessage(authError, "La session n’a pas pu être vérifiée")
            : "Connecte-toi pour modifier ta photo de profil.");
          return;
        }
        if (authData.user.id !== userId) {
          setError("La session ne correspond pas au profil modifié. Reconnecte-toi puis réessaie.");
          return;
        }

        const extension = AVATAR_EXTENSIONS[avatarFile.type];
        const objectPath = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .upload(objectPath, avatarFile, {
            cacheControl: "3600",
            contentType: avatarFile.type,
            upsert: false,
          });
        if (uploadError) {
          setError(getCommunityErrorMessage(uploadError, "La photo n’a pas pu être téléversée"));
          return;
        }
        uploadedAvatarPath = objectPath;
        uploadedAvatarUrl = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath).data.publicUrl;
      }

      const { data, error: updateError } = await supabase
        .from("profiles")
        .update({
          username: parsed.data.username,
          display_name: parsed.data.displayName,
          bio: parsed.data.bio || null,
          ...(uploadedAvatarUrl ? { avatar_url: uploadedAvatarUrl } : {}),
        })
        .eq("user_id", userId)
        .select("user_id");
      if (updateError) {
        if (uploadedAvatarPath) {
          const { error: cleanupError } = await supabase.storage.from(AVATAR_BUCKET).remove([uploadedAvatarPath]);
          if (cleanupError) {
            setError("Le profil n’a pas été mis à jour et la photo temporaire n’a pas pu être supprimée. Contacte le support.");
            return;
          }
        }
        setError(updateError.code === "23505"
          ? "Ce nom d’utilisateur est déjà pris."
          : getCommunityErrorMessage(updateError, "Le profil n’a pas pu être mis à jour"));
        return;
      }
      if (data?.length !== 1) {
        if (uploadedAvatarPath) {
          const { error: cleanupError } = await supabase.storage.from(AVATAR_BUCKET).remove([uploadedAvatarPath]);
          if (cleanupError) {
            setError("Aucun profil n’a été modifié et la photo temporaire n’a pas pu être supprimée. Contacte le support.");
            return;
          }
        }
        setError("Aucun profil n’a été modifié. Reconnecte-toi puis réessaie.");
        return;
      }
      profileSaved = true;
      if (uploadedAvatarUrl && uploadedAvatarPath) {
        const oldAvatarPath = avatarUrl ? getOwnedAvatarPath(supabase, avatarUrl) : null;
        setAvatarUrl(uploadedAvatarUrl);
        setAvatarFile(null);
        if (avatarInputRef.current) avatarInputRef.current.value = "";
        if (oldAvatarPath && oldAvatarPath !== uploadedAvatarPath) {
          const { error: removeOldError } = await supabase.storage.from(AVATAR_BUCKET).remove([oldAvatarPath]);
          setMessage(removeOldError
            ? "Profil et photo mis à jour. L’ancienne photo n’a pas pu être supprimée."
            : "Profil et photo mis à jour.");
        } else {
          setMessage("Profil et photo mis à jour.");
        }
      } else {
        setMessage("Profil mis à jour.");
      }
    } catch (profileError) {
      if (uploadedAvatarPath && supabase && !profileSaved) {
        try {
          const { error: cleanupError } = await supabase.storage.from(AVATAR_BUCKET).remove([uploadedAvatarPath]);
          setError(cleanupError
            ? "Le profil n’a pas pu être enregistré et la photo temporaire n’a pas pu être supprimée. Contacte le support."
            : getCommunityErrorMessage(profileError, "Le profil n’a pas pu être enregistré"));
        } catch {
          setError("Le profil n’a pas pu être enregistré et la photo temporaire n’a pas pu être supprimée. Contacte le support.");
        }
      } else if (profileSaved) {
        setMessage("Profil et photo mis à jour. L’ancienne photo n’a pas pu être supprimée.");
      } else {
        setError(getCommunityErrorMessage(profileError, "Supabase Community n’est pas disponible"));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <span className="block text-sm text-zinc-300">Photo de profil</span>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-700 bg-zinc-900 text-xs text-zinc-500">
            {(avatarPreviewUrl || avatarUrl) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreviewUrl ?? avatarUrl ?? ""} alt="Aperçu de la photo de profil" className="h-full w-full object-cover" />
            ) : "Aucune photo"}
          </div>
          <div className="min-w-0">
            <label className="inline-flex cursor-pointer rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900">
              Choisir une photo
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleAvatarChange}
                className="sr-only"
              />
            </label>
            <p className="mt-2 text-xs text-zinc-500">JPEG, PNG ou WebP · 2 Mo maximum. La photo sera envoyée avec l’enregistrement du profil.</p>
          </div>
        </div>
      </div>
      <label className="block text-sm text-zinc-300">Nom d’utilisateur
        <input required minLength={3} maxLength={24} pattern="[a-zA-Z0-9_]+" autoComplete="username" value={values.username} onChange={(event) => setValues((current) => ({ ...current, username: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" />
      </label>
      <label className="block text-sm text-zinc-300">Nom affiché
        <input required maxLength={50} value={values.displayName} onChange={(event) => setValues((current) => ({ ...current, displayName: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" />
      </label>
      <label className="block text-sm text-zinc-300">Présentation
        <textarea maxLength={280} rows={4} value={values.bio} onChange={(event) => setValues((current) => ({ ...current, bio: event.target.value }))} className="mt-1.5 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" />
        <span className="mt-1 block text-xs text-zinc-500">280 caractères maximum.</span>
      </label>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
      <button disabled={pending} className="rounded-lg bg-cyan-400 px-4 py-2.5 font-semibold text-zinc-950 disabled:opacity-60">{pending ? "Enregistrement…" : "Enregistrer le profil"}</button>
    </form>
  );
}
