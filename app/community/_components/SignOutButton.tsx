"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getCommunityErrorMessage } from "@/lib/community/errors";

export default function SignOutButton() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
    } catch (signOutError) {
      setPending(false);
      setError(getCommunityErrorMessage(signOutError, "La déconnexion n’a pas abouti"));
      return;
    }
    setPending(false);
    router.replace("/community/login");
    router.refresh();
  }

  return (
    <div>
      <button type="button" disabled={pending} onClick={() => void signOut()} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900 disabled:opacity-60">
        {pending ? "Déconnexion…" : "Se déconnecter"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-red-300">{error}</p>}
    </div>
  );
}
