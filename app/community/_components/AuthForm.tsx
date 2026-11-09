"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { loginSchema, registrationSchema, emailSchema } from "@/lib/community/schemas";
import { getCommunityErrorMessage } from "@/lib/community/errors";
import { createClient } from "@/lib/supabase/client";

type AuthFormProps = { mode: "register" | "login"; initialMessage?: string };

export default function AuthForm({ mode, initialMessage = "" }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isResetMode, setIsResetMode] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");

    if (isResetMode) {
      const parsedEmail = emailSchema.safeParse(email);
      if (!parsedEmail.success) {
        setError("Saisis une adresse e-mail valide.");
        return;
      }

      setPending(true);
      try {
        const supabase = createClient();
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsedEmail.data, {
          redirectTo: `${window.location.origin}/community/auth/callback?next=/community/reset-password`,
        });
        if (resetError) throw resetError;
        setMessage("Si un compte correspond à cette adresse, un e-mail de réinitialisation va être envoyé.");
      } catch (resetRequestError) {
        setError(getCommunityErrorMessage(resetRequestError, "La demande de réinitialisation n’a pas abouti"));
      } finally {
        setPending(false);
      }
      return;
    }

    const parsed = mode === "register"
      ? registrationSchema.safeParse({ email, password, displayName })
      : loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Vérifie les informations saisies.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      if (mode === "register") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: parsed.data.email,
          password: parsed.data.password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: `${window.location.origin}/community/auth/callback?next=/community/profile`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          router.replace("/community/profile");
          router.refresh();
        } else {
          setMessage("Inscription reçue. Consulte ta boîte e-mail pour confirmer l’adresse.");
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });
        if (signInError) throw signInError;
        router.replace("/community/profile");
        router.refresh();
      }
    } catch (authError) {
      setError(getCommunityErrorMessage(authError, mode === "register"
        ? "Inscription impossible. Vérifie les champs ou réessaie plus tard"
        : "Connexion impossible. Vérifie l’adresse et le mot de passe"));
    } finally {
      setPending(false);
    }
  }

  const title = isResetMode ? "Réinitialiser le mot de passe" : mode === "register" ? "Créer un compte" : "Connexion";

  return (
    <section className="mx-auto max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
      <h1 className="text-2xl font-bold">{title}</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {mode === "register" && !isResetMode && <label className="block text-sm text-zinc-300">Nom affiché
          <input required autoComplete="nickname" maxLength={50} value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" />
        </label>}
        <label className="block text-sm text-zinc-300">E-mail
          <input required type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" />
        </label>
        {!isResetMode && <label className="block text-sm text-zinc-300">Mot de passe
          <input required type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 8 : 1} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-white" />
          {mode === "register" && <span className="mt-1 block text-xs text-zinc-500">8 caractères minimum.</span>}
        </label>}
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-300">{message}</p>}
        <button type="submit" disabled={pending} className="w-full rounded-lg bg-cyan-400 px-4 py-2.5 font-semibold text-zinc-950 disabled:opacity-60">
          {pending ? "Patiente…" : isResetMode ? "Envoyer le lien" : mode === "register" ? "Créer mon compte" : "Se connecter"}
        </button>
      </form>
      <div className="mt-5 flex flex-wrap justify-between gap-3 text-sm text-zinc-400">
        {mode === "login" && <button type="button" onClick={() => { setIsResetMode((value) => !value); setError(""); setMessage(""); }} className="hover:text-white">
          {isResetMode ? "Retour à la connexion" : "Mot de passe oublié ?"}
        </button>}
        {!isResetMode && <Link href={mode === "register" ? "/community/login" : "/community/register"} className="hover:text-white">
          {mode === "register" ? "Déjà inscrit ? Se connecter" : "Créer un compte"}
        </Link>}
      </div>
    </section>
  );
}
