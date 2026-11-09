import { redirect } from "next/navigation";

import ProfileEditor from "../_components/ProfileEditor";
import SignOutButton from "../_components/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import { getCommunityErrorMessage } from "@/lib/community/errors";

type ProfileRow = {
  user_id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
};

export default async function CommunityProfilePage() {
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
      <h1 className="text-2xl font-bold">Profil Community</h1>
      <p role="alert" className="mt-3 text-sm text-amber-200">Supabase Community n’est pas configuré dans cet environnement.</p>
    </section>;
  }
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;
  if (authError || typeof userId !== "string") redirect("/community/login");

  const [{ data: profile, error: profileError }, { data: userData }] = await Promise.all([
    supabase.from("profiles").select("user_id, username, display_name, bio").eq("user_id", userId).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  if (profileError) {
    return <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
      <h1 className="text-2xl font-bold">Profil Community</h1>
      <p role="alert" className="mt-3 text-sm text-amber-200">{getCommunityErrorMessage(profileError, "Le profil est indisponible")}</p>
      <div className="mt-5"><SignOutButton /></div>
    </section>;
  }

  const profileRow = profile as ProfileRow | null;
  if (!profileRow) {
    return <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
      <h1 className="text-2xl font-bold">Profil Community</h1>
      <p className="mt-3 text-sm text-zinc-300">Aucun profil n’est associé à ce compte. Déconnecte-toi puis contacte le support.</p>
      <div className="mt-5"><SignOutButton /></div>
    </section>;
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Mon profil</h1>
          <p className="mt-1 text-sm text-zinc-400">{userData.user?.email ?? "Compte vérifié"}</p>
        </div>
        <SignOutButton />
      </div>
      <ProfileEditor
        userId={userId}
        username={profileRow.username}
        displayName={profileRow.display_name ?? ""}
        bio={profileRow.bio ?? ""}
      />
    </section>
  );
}
