"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getCommunityErrorMessage } from "@/lib/community/errors";
import { createClient } from "@/lib/supabase/client";

type PublicProject = {
  id: string;
  slug: string;
  name: string;
  ticker: string | null;
  chain: string;
  description: string;
};

type CatalogState = "loading" | "ready" | "error";

export default function CommunityProjectsPage() {
  const [search, setSearch] = useState("");
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [catalogState, setCatalogState] = useState<CatalogState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let isActive = true;

    const task = window.setTimeout(() => {
      async function loadProjects() {
        try {
          const supabase = createClient();
          let request = supabase
            .from("community_public_projects")
            .select("id, slug, name, ticker, chain, description")
            .order("name", { ascending: true })
            .limit(50);
          const searchTerm = search.trim();
          if (searchTerm) request = request.ilike("name", `%${searchTerm}%`);

          const { data, error } = await request;
          if (error) throw error;
          if (!isActive) return;

          setProjects((data ?? []) as PublicProject[]);
          setCatalogState("ready");
        } catch (error) {
          if (!isActive) return;
          setErrorMessage(getCommunityErrorMessage(error, "Le catalogue des projets est indisponible"));
          setCatalogState("error");
        }
      }

      void loadProjects();
    }, 250);

    return () => {
      isActive = false;
      window.clearTimeout(task);
    };
  }, [search, retryCount]);

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">
            ZingSwap Community
          </p>
          <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">
            Découvrir les projets
          </h1>
          <p className="mt-3 text-sm text-zinc-400">
            Explore les projets crypto publiés dans la Community.
          </p>
        </div>
        <Link
          href="/community/projects/new"
          className="inline-flex min-h-11 w-fit items-center justify-center rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-cyan-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
        >
          Soumettre un projet
        </Link>
      </header>

      <div className="mb-6">
        <label htmlFor="project-search" className="mb-2 block text-sm font-medium text-zinc-200">
          Rechercher un projet par son nom
        </label>
        <input
          id="project-search"
          type="search"
          value={search}
          onChange={(event) => {
            setCatalogState("loading");
            setErrorMessage("");
            setSearch(event.target.value);
          }}
          placeholder="Nom du projet"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-400 focus:outline-none"
        />
      </div>

      {catalogState === "loading" && (
        <p role="status" className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-300">
          Chargement des projets…
        </p>
      )}

      {catalogState === "error" && (
        <div role="alert" className="rounded-xl border border-red-900 bg-red-950/30 p-5 text-red-200">
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => {
              setCatalogState("loading");
              setErrorMessage("");
              setRetryCount((count) => count + 1);
            }}
            className="mt-3 underline underline-offset-2"
          >
            Réessayer
          </button>
        </div>
      )}

      {catalogState === "ready" && projects.length === 0 && (
        <p className="rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-400">
          {search.trim()
            ? "Aucun projet publié ne correspond à cette recherche."
            : "Aucun projet publié pour le moment."}
        </p>
      )}

      {catalogState === "ready" && projects.length > 0 && (
        <ul className="space-y-4">
          {projects.map((project) => (
            <li key={project.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {project.name}
                    {project.ticker && <span className="ml-2 text-sm font-medium text-cyan-300">({project.ticker})</span>}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">Réseau : {project.chain}</p>
                </div>
                <Link
                  href={`/community/projects/${encodeURIComponent(project.slug)}`}
                  className="text-sm font-medium text-cyan-300 hover:text-cyan-200"
                >
                  Voir le projet
                </Link>
              </div>
              <p className="mt-4 line-clamp-3 whitespace-pre-wrap break-words text-sm text-zinc-300">
                {project.description || "Aucune description fournie."}
              </p>
            </li>
          ))}
        </ul>
      )}

      {catalogState === "ready" && projects.length === 50 && (
        <p className="mt-4 text-center text-xs text-zinc-500">
          Affichage limité aux 50 premiers résultats.
        </p>
      )}
    </div>
  );
}
