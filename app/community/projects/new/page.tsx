"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { getCommunityErrorMessage } from "@/lib/community/errors";
import { createClient } from "@/lib/supabase/client";

type AuthState = "checking" | "signed-in" | "signed-out" | "error";
type ProjectFields = "name" | "ticker" | "chain" | "contractAddress" | "description";
type ProjectForm = Record<ProjectFields, string>;
type FieldErrors = Partial<Record<ProjectFields, string>>;

const emptyForm: ProjectForm = {
  name: "",
  ticker: "",
  chain: "",
  contractAddress: "",
  description: "",
};

function createProjectSlug(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "projet";
  const prefix = base.slice(0, 67).replace(/-+$/g, "") || "projet";
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `${prefix}-${suffix}`;
}

function validateForm(form: ProjectForm): FieldErrors {
  const errors: FieldErrors = {};
  const name = form.name.trim();
  const ticker = form.ticker.trim();
  const chain = form.chain.trim();
  const contractAddress = form.contractAddress.trim();
  const description = form.description.trim();

  if (name.length < 2 || name.length > 80) errors.name = "Le nom doit contenir entre 2 et 80 caractères.";
  if (!/^[A-Za-z0-9]{1,16}$/.test(ticker)) errors.ticker = "Le symbole doit contenir de 1 à 16 lettres ou chiffres.";
  if (chain.length < 2 || chain.length > 40) errors.chain = "La blockchain doit contenir entre 2 et 40 caractères.";
  if (!contractAddress) errors.contractAddress = "L’adresse du contrat est obligatoire.";
  else if (contractAddress.length > 256) errors.contractAddress = "L’adresse ne doit pas dépasser 256 caractères.";
  if (!description) errors.description = "La description est obligatoire.";
  else if (description.length > 2000) errors.description = "La description ne doit pas dépasser 2 000 caractères.";

  return errors;
}

function inputClass(hasError: boolean) {
  return `w-full rounded-xl border bg-black/40 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none ${
    hasError ? "border-red-700 focus:border-red-500" : "border-zinc-800 focus:border-cyan-400"
  }`;
}

export default function NewCommunityProjectPage() {
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authMessage, setAuthMessage] = useState("");
  const [form, setForm] = useState<ProjectForm>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const submissionLock = useRef(false);

  useEffect(() => {
    let isActive = true;

    async function checkUser() {
      try {
        const { data, error } = await createClient().auth.getUser();
        if (!isActive) return;
        if (error) throw error;
        setAuthState(data.user ? "signed-in" : "signed-out");
      } catch (error) {
        if (!isActive) return;
        setAuthMessage(getCommunityErrorMessage(error, "La session Community n’a pas pu être vérifiée"));
        setAuthState("error");
      }
    }

    void checkUser();
    return () => {
      isActive = false;
    };
  }, []);

  function updateField(field: ProjectFields, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setFormError("");
  }

  async function submitProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submissionLock.current) return;

    const errors = validateForm(form);
    setFieldErrors(errors);
    setFormError("");
    if (Object.keys(errors).length > 0) return;

    submissionLock.current = true;
    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: userResult, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userResult.user) {
        setAuthState("signed-out");
        setFormError("Ta session a expiré. Connecte-toi puis réessaie.");
        return;
      }

      const { error } = await supabase.from("projects").insert({
        owner_id: userResult.user.id,
        slug: createProjectSlug(form.name.trim()),
        name: form.name.trim(),
        ticker: form.ticker.trim(),
        chain: form.chain.trim(),
        contract_address: form.contractAddress.trim(),
        description: form.description.trim(),
      });
      if (error) throw error;

      setSubmissionComplete(true);
    } catch (error) {
      const fields = error && typeof error === "object" ? error as { code?: unknown } : {};
      setFormError(fields.code === "23505"
        ? "Cette référence de projet est déjà utilisée. Réessaie pour générer une nouvelle référence."
        : getCommunityErrorMessage(error, "Le projet n’a pas pu être soumis"));
    } finally {
      submissionLock.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/community/projects" className="text-sm font-medium text-cyan-300 hover:text-cyan-200">
        ← Retour aux projets
      </Link>

      <header className="mb-6 mt-6">
        <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">ZingSwap Community</p>
        <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">Soumettre un projet</h1>
        <p className="mt-3 text-sm text-zinc-400">
          La soumission est gratuite. Chaque projet est vérifié avant sa publication.
        </p>
      </header>

      {authState === "checking" && (
        <p role="status" className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-300">
          Vérification de la session…
        </p>
      )}

      {authState === "signed-out" && (
        <div className="rounded-xl border border-amber-800 bg-amber-950/30 p-5 text-amber-100">
          <p>Connecte-toi pour soumettre un projet.</p>
          <Link href="/community/login" className="mt-3 inline-block font-medium text-cyan-300 hover:text-cyan-200">
            Se connecter
          </Link>
        </div>
      )}

      {authState === "error" && (
        <div role="alert" className="rounded-xl border border-red-900 bg-red-950/30 p-5 text-red-200">
          {authMessage}
        </div>
      )}

      {authState === "signed-in" && submissionComplete && (
        <div role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-5 text-emerald-100">
          <h2 className="text-lg font-semibold">Projet soumis</h2>
          <p className="mt-2 text-sm">Ton projet attend sa validation avant d’apparaître dans le catalogue.</p>
          <Link href="/community/projects" className="mt-4 inline-block font-medium text-cyan-300 hover:text-cyan-200">
            Retour au catalogue
          </Link>
        </div>
      )}

      {authState === "signed-in" && !submissionComplete && (
        <form onSubmit={submitProject} noValidate className="space-y-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-7">
          <div>
            <label htmlFor="project-name" className="mb-2 block text-sm font-medium text-zinc-200">Nom du projet</label>
            <input
              id="project-name"
              required
              maxLength={80}
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              className={inputClass(Boolean(fieldErrors.name))}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "project-name-error" : undefined}
            />
            {fieldErrors.name && <p id="project-name-error" className="mt-1 text-sm text-red-300">{fieldErrors.name}</p>}
          </div>

          <div>
            <label htmlFor="project-ticker" className="mb-2 block text-sm font-medium text-zinc-200">Symbole du token</label>
            <input
              id="project-ticker"
              required
              maxLength={16}
              value={form.ticker}
              onChange={(event) => updateField("ticker", event.target.value)}
              className={inputClass(Boolean(fieldErrors.ticker))}
              aria-invalid={Boolean(fieldErrors.ticker)}
              aria-describedby={fieldErrors.ticker ? "project-ticker-error" : undefined}
            />
            {fieldErrors.ticker && <p id="project-ticker-error" className="mt-1 text-sm text-red-300">{fieldErrors.ticker}</p>}
          </div>

          <div>
            <label htmlFor="project-chain" className="mb-2 block text-sm font-medium text-zinc-200">Blockchain</label>
            <input
              id="project-chain"
              required
              maxLength={40}
              value={form.chain}
              onChange={(event) => updateField("chain", event.target.value)}
              className={inputClass(Boolean(fieldErrors.chain))}
              aria-invalid={Boolean(fieldErrors.chain)}
              aria-describedby={fieldErrors.chain ? "project-chain-error" : undefined}
            />
            {fieldErrors.chain && <p id="project-chain-error" className="mt-1 text-sm text-red-300">{fieldErrors.chain}</p>}
          </div>

          <div>
            <label htmlFor="project-contract" className="mb-2 block text-sm font-medium text-zinc-200">Adresse du contrat</label>
            <input
              id="project-contract"
              required
              maxLength={256}
              value={form.contractAddress}
              onChange={(event) => updateField("contractAddress", event.target.value)}
              className={inputClass(Boolean(fieldErrors.contractAddress))}
              aria-invalid={Boolean(fieldErrors.contractAddress)}
              aria-describedby={fieldErrors.contractAddress ? "project-contract-error" : undefined}
            />
            {fieldErrors.contractAddress && <p id="project-contract-error" className="mt-1 text-sm text-red-300">{fieldErrors.contractAddress}</p>}
          </div>

          <div>
            <label htmlFor="project-description" className="mb-2 block text-sm font-medium text-zinc-200">Description du projet</label>
            <textarea
              id="project-description"
              required
              rows={6}
              maxLength={2000}
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              className={inputClass(Boolean(fieldErrors.description))}
              aria-invalid={Boolean(fieldErrors.description)}
              aria-describedby={fieldErrors.description ? "project-description-error" : undefined}
            />
            {fieldErrors.description && <p id="project-description-error" className="mt-1 text-sm text-red-300">{fieldErrors.description}</p>}
          </div>

          {formError && <p role="alert" className="rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">{formError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-semibold text-zinc-950 hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            {isSubmitting ? "Envoi en cours…" : "Soumettre gratuitement"}
          </button>
          <p className="text-xs text-zinc-500">Le projet restera en attente jusqu’à sa validation.</p>
        </form>
      )}
    </div>
  );
}
