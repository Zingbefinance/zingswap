"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { passwordSchema } from "@/lib/community/schemas";
import { getCommunityErrorMessage } from "@/lib/community/errors";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Mot de passe invalide.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data });
      if (updateError) throw updateError;
    } catch (passwordError) {
      setPending(false);
      setError(getCommunityErrorMessage(passwordError, "La mise à jour n’a pas abouti. Demande un nouveau lien de réinitialisation"));
      return;
    }
    setPending(false);
    router.replace("/community/profile");
    router.refresh();
  }

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
      <h1 className="text-2xl font-bold">Choisir un nouveau mot de passe</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm text-zinc-300">Nouveau mot de passe
          <input required type="password" autoComplete="new-password" minLength={8} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" />
        </label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button disabled={pending} className="w-full rounded-lg bg-cyan-400 px-4 py-2.5 font-semibold text-zinc-950 disabled:opacity-60">{pending ? "Patiente…" : "Mettre à jour"}</button>
      </form>
    </section>
  );
}
