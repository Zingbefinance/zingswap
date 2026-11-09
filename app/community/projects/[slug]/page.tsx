"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

import { getCommunityErrorMessage } from "@/lib/community/errors";
import { createClient } from "@/lib/supabase/client";

type PublicProject = {
  id: string;
  slug: string;
  name: string;
  ticker: string | null;
  chain: string;
  contract_address: string | null;
  description: string;
};

type ProjectState = "loading" | "ready" | "not-found" | "error";

export default function CommunityProjectDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const [project, setProject] = useState<PublicProject | null>(null);
  const [projectState, setProjectState] = useState<ProjectState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadProject() {
      try {
        const { data, error } = await createClient()
          .from("community_public_projects")
          .select("id, slug, name, ticker, chain, contract_address, description")
          .eq("slug", slug)
          .maybeSingle();

        if (error) throw error;
        if (!isActive) return;

        if (!data) {
          setProject(null);
          setProjectState("not-found");
          return;
        }

        setProject(data as PublicProject);
        setProjectState("ready");
      } catch (error) {
        if (!isActive) return;
        setErrorMessage(getCommunityErrorMessage(error, "La fiche du projet est indisponible"));
        setProjectState("error");
      }
    }

    void loadProject();
    return () => {
      isActive = false;
    };
  }, [slug, retryCount]);

  async function copyContractAddress() {
    if (!project?.contract_address) return;

    try {
      await navigator.clipboard.writeText(project.contract_address);
      setCopyMessage("Adresse copiée.");
    } catch {
      setCopyMessage("La copie a échoué. Sélectionne l’adresse pour la copier manuellement.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/community/projects"
        className="text-sm font-medium text-cyan-300 hover:text-cyan-200"
      >
        ← Retour aux projets
      </Link>

      {projectState === "loading" && (
        <p role="status" className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-300">
          Chargement du projet…
        </p>
      )}

      {projectState === "not-found" && (
        <div role="status" className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-300">
          Ce projet est introuvable ou indisponible. Seuls les projets publiés sont accessibles.
        </div>
      )}

      {projectState === "error" && (
        <div role="alert" className="mt-6 rounded-xl border border-red-900 bg-red-950/30 p-5 text-red-200">
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              setProjectState("loading");
              setErrorMessage("");
              setRetryCount((count) => count + 1);
            }}
            className="mt-3 underline underline-offset-2"
          >
            Réessayer
          </button>
        </div>
      )}

      {projectState === "ready" && project && (
        <article className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-6 sm:p-8">
          <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">
            Projet Community
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            {project.name}
          </h1>

          <dl className="mt-8 grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Symbole</dt>
              <dd className="mt-1 text-zinc-100">{project.ticker || "Non renseigné"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">Blockchain</dt>
              <dd className="mt-1 text-zinc-100">{project.chain}</dd>
            </div>
          </dl>

          <section className="mt-8 border-t border-zinc-800 pt-6">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">Adresse du contrat</h2>
            {project.contract_address ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <code className="break-all rounded-lg bg-black/50 px-3 py-2 text-sm text-zinc-200">
                  {project.contract_address}
                </code>
                <button
                  type="button"
                  onClick={() => void copyContractAddress()}
                  className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-medium text-cyan-300 hover:border-cyan-400/50 hover:text-cyan-200"
                >
                  Copier l’adresse
                </button>
              </div>
            ) : (
              <p className="mt-2 text-sm text-zinc-400">Aucune adresse de contrat renseignée.</p>
            )}
            {copyMessage && <p role="status" className="mt-2 text-sm text-zinc-400">{copyMessage}</p>}
          </section>

          <section className="mt-8 border-t border-zinc-800 pt-6">
            <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-400">Description</h2>
            <p className="mt-3 whitespace-pre-wrap break-words text-zinc-200">
              {project.description || "Aucune description fournie."}
            </p>
          </section>
        </article>
      )}
    </div>
  );
}
