"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { getCommunityErrorMessage } from "@/lib/community/errors";

type PendingPost = {
  post_id: string;
  body: string;
  created_at: string;
  display_name: string;
};

type PendingComment = {
  comment_id: string;
  post_id: string;
  body: string;
  created_at: string;
  display_name: string;
};

type PendingProject = {
  id: string;
  name: string;
  ticker: string | null;
  chain: string;
  contract_address: string | null;
  description: string;
  slug: string;
  created_at: string;
};

type CommunityReport = {
  report_id: string;
  target_type: "post" | "comment" | "project";
  target_id: string;
  reason: "spam" | "scam" | "abuse" | "impersonation" | "other";
  details: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
  content_available: boolean;
  content_label: string | null;
  content_text: string | null;
  content_status: string | null;
};

type QueueState = "loading" | "ready" | "error";

const targetTypeLabels: Record<CommunityReport["target_type"], string> = {
  post: "Publication",
  comment: "Commentaire",
  project: "Projet",
};

const reportReasonLabels: Record<CommunityReport["reason"], string> = {
  spam: "Spam",
  scam: "Arnaque",
  abuse: "Abus ou harcèlement",
  impersonation: "Usurpation d’identité",
  other: "Autre",
};

const reportStatusLabels: Record<CommunityReport["status"], string> = {
  open: "Ouvert",
  reviewing: "En examen",
  resolved: "Résolu",
  dismissed: "Rejeté",
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

export default function ModerationClient() {
  const [isModerator, setIsModerator] = useState<boolean | null>(null);
  const [posts, setPosts] = useState<PendingPost[]>([]);
  const [comments, setComments] = useState<PendingComment[]>([]);
  const [projects, setProjects] = useState<PendingProject[]>([]);
  const [publicPosts, setPublicPosts] = useState<PendingPost[]>([]);
  const [publicComments, setPublicComments] = useState<PendingComment[]>([]);
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [queueState, setQueueState] = useState<QueueState>("loading");
  const [projectQueueState, setProjectQueueState] = useState<QueueState>("loading");
  const [projectError, setProjectError] = useState("");
  const [projectNotice, setProjectNotice] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [busyReportId, setBusyReportId] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
      setErrorMessage("");
      if (claimsError) throw claimsError;
      if (!claimsData?.claims?.sub) {
        setIsModerator(false);
        setProjects([]);
        setProjectQueueState("ready");
        setQueueState("ready");
        return;
      }

      const appMetadata = claimsData.claims.app_metadata;
      const hasModeratorClaim =
        typeof appMetadata === "object" &&
        appMetadata !== null &&
        "community_role" in appMetadata &&
        appMetadata.community_role === "moderator";
      setIsModerator(hasModeratorClaim);
      if (!hasModeratorClaim) {
        setProjects([]);
        setProjectQueueState("ready");
        setQueueState("ready");
        return;
      }

      setProjectQueueState("loading");
      const projectQueuePromise = (async () => {
        try {
          const { data, error } = await supabase.rpc("list_pending_community_projects");
          if (error) throw error;
          setProjects((data ?? []) as PendingProject[]);
          setProjectError("");
          setProjectQueueState("ready");
        } catch (projectLoadError) {
          setProjectError(getCommunityErrorMessage(projectLoadError, "La file des projets est indisponible"));
          setProjectQueueState("error");
        }
      })();
      const [postResult, commentResult, publicPostResult, publicCommentResult, reportResult] = await Promise.all([
        supabase.rpc("list_pending_community_posts"),
        supabase.rpc("list_pending_community_comments"),
        supabase.from("community_public_feed").select("post_id, body, created_at, display_name").order("created_at", { ascending: false }).limit(100),
        supabase.from("community_public_comments").select("comment_id, post_id, body, created_at, display_name").order("created_at", { ascending: false }).limit(100),
        supabase.rpc("list_community_reports"),
      ]);
      if (postResult.error) throw postResult.error;
      if (commentResult.error) throw commentResult.error;
      if (publicPostResult.error) throw publicPostResult.error;
      if (publicCommentResult.error) throw publicCommentResult.error;
      if (reportResult.error) throw reportResult.error;
      setPosts((postResult.data ?? []) as PendingPost[]);
      setComments((commentResult.data ?? []) as PendingComment[]);
      setPublicPosts((publicPostResult.data ?? []) as PendingPost[]);
      setPublicComments((publicCommentResult.data ?? []) as PendingComment[]);
      setReports((reportResult.data ?? []) as CommunityReport[]);
      await projectQueuePromise;
      setQueueState("ready");
    } catch (queueError) {
      setErrorMessage(getCommunityErrorMessage(queueError, "La file de modération est indisponible"));
      setQueueState("error");
    }
  }, []);

  useEffect(() => {
    const task = window.setTimeout(() => void loadQueue(), 0);
    return () => window.clearTimeout(task);
  }, [loadQueue]);

  function refreshQueue() {
    setQueueState("loading");
    void loadQueue();
  }

  async function refreshProjects() {
    setProjectQueueState("loading");
    setProjectError("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("list_pending_community_projects");
      if (error) throw error;
      setProjects((data ?? []) as PendingProject[]);
      setProjectQueueState("ready");
    } catch (loadError) {
      setProjectError(getCommunityErrorMessage(loadError, "La file des projets est indisponible"));
      setProjectQueueState("error");
    }
  }

  async function moderateProject(project: PendingProject, decision: "published" | "rejected") {
    const decisionLabel = decision === "published" ? "approuver" : "refuser";
    if (!window.confirm(`Confirmer que tu souhaites ${decisionLabel} le projet « ${project.name} » ?`)) return;

    setBusyProjectId(project.id);
    setProjectError("");
    setProjectNotice("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("moderate_community_project", {
        p_project_id: project.id,
        p_decision: decision,
      });
      if (error) throw error;
      if (data === true) {
        setProjects((currentProjects) => currentProjects.filter((current) => current.id !== project.id));
        setProjectNotice(`Projet « ${project.name} » ${decision === "published" ? "approuvé" : "refusé"}.`);
        return;
      }
      setProjectNotice(`Le projet « ${project.name} » n’est plus en attente. La file a été actualisée.`);
      await refreshProjects();
    } catch (moderationError) {
      setProjectError(getCommunityErrorMessage(moderationError, "Décision impossible. Vérifie ton rôle de modérateur."));
    } finally {
      setBusyProjectId(null);
    }
  }

  async function copyContractAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopyNotice("Adresse du contrat copiée.");
    } catch {
      setCopyNotice("Impossible de copier l’adresse du contrat depuis ce navigateur.");
    }
  }

  async function moderate(kind: "post" | "comment", id: string, decision: "published" | "rejected" | "hidden") {
    setBusyItem(id);
    setErrorMessage("");
    try {
      const supabase = createClient();
      const { data, error } = kind === "post"
        ? await supabase.rpc("moderate_community_post", { p_post_id: id, p_decision: decision })
        : await supabase.rpc("moderate_community_comment", { p_comment_id: id, p_decision: decision });
      if (error) throw error;
      if (!data) {
        setErrorMessage("Cet élément n’est plus en attente. Actualise la file.");
        return;
      }
      await loadQueue();
    } catch (moderationError) {
      setErrorMessage(getCommunityErrorMessage(moderationError, "Action refusée ou impossible. Vérifie ton rôle de modérateur"));
    } finally {
      setBusyItem(null);
    }
  }

  async function moderateReport(reportId: string, status: "reviewing" | "resolved" | "dismissed") {
    setBusyReportId(reportId);
    setErrorMessage("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("moderate_community_report", {
        p_report_id: reportId,
        p_status: status,
      });
      if (error) throw error;
      if (!data) {
        setErrorMessage("Ce signalement n’est plus modifiable. Actualise la file.");
        return;
      }
      await loadQueue();
    } catch (reportError) {
      setErrorMessage(getCommunityErrorMessage(reportError, "Action refusée ou impossible. Vérifie ton rôle de modérateur"));
    } finally {
      setBusyReportId(null);
    }
  }

  return (
    <section className="mx-auto max-w-4xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-cyan-300">ZingSwap Community</p>
          <h1 className="mt-2 text-3xl font-bold">Modération</h1>
          <p className="mt-2 text-sm text-zinc-400">Contenus soumis en attente de validation.</p>
        </div>
        <Link href="/community/feed" className="text-sm text-cyan-300 hover:text-cyan-200">Retour au fil</Link>
      </div>

      {isModerator === false && queueState === "ready" && (
        <p role="alert" className="mt-6 rounded-xl border border-amber-800 bg-amber-950/30 p-4 text-amber-200">
          Accès réservé aux modérateurs autorisés.
        </p>
      )}
      {queueState === "loading" && <p role="status" className="mt-6 text-zinc-300">Chargement de la file…</p>}
      {queueState === "error" && (
        <div role="alert" className="mt-6 rounded-xl border border-red-900 bg-red-950/30 p-4 text-red-200">
          <p>{errorMessage}</p>
          <button type="button" onClick={refreshQueue} className="mt-3 underline underline-offset-2">Réessayer</button>
        </div>
      )}
      {errorMessage && queueState === "ready" && (
        <p role="alert" className="mt-5 rounded-lg bg-red-950/40 p-3 text-sm text-red-200">{errorMessage}</p>
      )}
      {isModerator && queueState === "ready" && (
        <>
          <section className="mt-8 border-t border-zinc-800 pt-8">
            <h2 className="text-xl font-semibold">Projets en attente ({projects.length})</h2>
            {projectNotice && <p role="status" className="mt-3 text-sm text-emerald-300">{projectNotice}</p>}
            {copyNotice && <p role="status" className="mt-2 text-sm text-zinc-400">{copyNotice}</p>}
            {projectQueueState === "loading" && <p role="status" className="mt-3 text-sm text-zinc-400">Chargement des projets…</p>}
            {projectQueueState === "error" && (
              <div role="alert" className="mt-3 rounded-lg border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">
                <p>{projectError}</p>
                <button type="button" onClick={() => void refreshProjects()} className="mt-2 underline underline-offset-2">Réessayer</button>
              </div>
            )}
            {projectQueueState === "ready" && projects.length === 0 ? (
              <p className="mt-3 text-sm text-zinc-400">Aucun projet en attente.</p>
            ) : projectQueueState === "ready" && (
              <ul className="mt-4 space-y-4">
                {projects.map((project) => (
                  <li key={project.id} className="rounded-xl border border-zinc-800 bg-black/40 p-4">
                    <h3 className="font-semibold text-zinc-100">
                      {project.name}{project.ticker ? ` (${project.ticker})` : ""}
                    </h3>
                    <p className="mt-1 text-sm text-zinc-400">Blockchain : {project.chain}</p>
                    {project.contract_address && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <span className="break-all text-sm text-zinc-300">Contrat : {project.contract_address}</span>
                        <button
                          type="button"
                          onClick={() => void copyContractAddress(project.contract_address!)}
                          className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-cyan-200 hover:bg-zinc-800"
                        >
                          Copier
                        </button>
                      </div>
                    )}
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-200">{project.description}</p>
                    <p className="mt-3 text-xs text-zinc-500">Soumis le {formatDate(project.created_at)}</p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={busyProjectId !== null}
                        onClick={() => void moderateProject(project, "published")}
                        className="rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                      >
                        Approuver
                      </button>
                      <button
                        type="button"
                        disabled={busyProjectId !== null}
                        onClick={() => void moderateProject(project, "rejected")}
                        className="rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/25 disabled:opacity-50"
                      >
                        Refuser
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-8">
            <h2 className="text-xl font-semibold">Publications ({posts.length})</h2>
            {posts.length === 0 ? <p className="mt-3 text-sm text-zinc-400">Aucune publication en attente.</p> : (
              <ul className="mt-4 space-y-4">
                {posts.map((post) => (
                  <li key={post.post_id} className="rounded-xl border border-zinc-800 bg-black/40 p-4">
                    <p className="text-sm text-zinc-400">{post.display_name} · {formatDate(post.created_at)}</p>
                    <p className="mt-3 whitespace-pre-wrap break-words text-zinc-100">{post.body}</p>
                    <div className="mt-4 flex gap-3">
                      <button type="button" disabled={busyItem === post.post_id} onClick={() => void moderate("post", post.post_id, "published")} className="rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50">Approuver</button>
                      <button type="button" disabled={busyItem === post.post_id} onClick={() => void moderate("post", post.post_id, "rejected")} className="rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/25 disabled:opacity-50">Rejeter</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10 border-t border-zinc-800 pt-8">
            <h2 className="text-xl font-semibold">Signalements ({reports.length})</h2>
            {reports.length === 0 ? <p className="mt-3 text-sm text-zinc-400">Aucun signalement.</p> : (
              <ul className="mt-4 space-y-4">
                {reports.map((report) => (
                  <li key={report.report_id} className="rounded-xl border border-zinc-800 bg-black/40 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-zinc-100">
                          {targetTypeLabels[report.target_type]} · {reportReasonLabels[report.reason]}
                        </p>
                        <p className="mt-1 text-sm text-zinc-400">
                          {formatDate(report.created_at)} · Statut : {reportStatusLabels[report.status]}
                        </p>
                      </div>
                    </div>
                    {report.details && (
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-zinc-300">
                        <span className="font-medium text-zinc-200">Détails : </span>{report.details}
                      </p>
                    )}
                    <div className="mt-4 rounded-lg bg-zinc-900/70 p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">Contenu signalé</p>
                      {!report.content_available ? (
                        <p className="mt-2 text-sm text-amber-200">Contenu supprimé ou indisponible</p>
                      ) : (
                        <>
                          {report.content_label && <p className="mt-2 font-medium text-zinc-100">{report.content_label}</p>}
                          {report.content_text && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-zinc-200">{report.content_text}</p>}
                          {report.content_status && <p className="mt-2 text-xs text-zinc-500">État du contenu : {report.content_status}</p>}
                        </>
                      )}
                    </div>
                    {(report.status === "open" || report.status === "reviewing") && (
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={busyReportId !== null}
                          onClick={() => void moderateReport(report.report_id, "reviewing")}
                          className="rounded-lg bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-50"
                        >
                          En examen
                        </button>
                        <button
                          type="button"
                          disabled={busyReportId !== null}
                          onClick={() => void moderateReport(report.report_id, "resolved")}
                          className="rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
                        >
                          Résoudre
                        </button>
                        <button
                          type="button"
                          disabled={busyReportId !== null}
                          onClick={() => void moderateReport(report.report_id, "dismissed")}
                          className="rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/25 disabled:opacity-50"
                        >
                          Rejeter
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-semibold">Commentaires ({comments.length})</h2>
            {comments.length === 0 ? <p className="mt-3 text-sm text-zinc-400">Aucun commentaire en attente.</p> : (
              <ul className="mt-4 space-y-4">
                {comments.map((comment) => (
                  <li key={comment.comment_id} className="rounded-xl border border-zinc-800 bg-black/40 p-4">
                    <p className="text-sm text-zinc-400">{comment.display_name} · {formatDate(comment.created_at)}</p>
                    <p className="mt-2 text-xs text-zinc-500">Publication : {comment.post_id}</p>
                    <p className="mt-3 whitespace-pre-wrap break-words text-zinc-100">{comment.body}</p>
                    <div className="mt-4 flex gap-3">
                      <button type="button" disabled={busyItem === comment.comment_id} onClick={() => void moderate("comment", comment.comment_id, "published")} className="rounded-lg bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50">Approuver</button>
                      <button type="button" disabled={busyItem === comment.comment_id} onClick={() => void moderate("comment", comment.comment_id, "rejected")} className="rounded-lg bg-red-500/15 px-4 py-2 text-sm font-medium text-red-200 hover:bg-red-500/25 disabled:opacity-50">Rejeter</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10 border-t border-zinc-800 pt-8">
            <h2 className="text-xl font-semibold">Publications visibles (100 dernières)</h2>
            {publicPosts.length === 0 ? <p className="mt-3 text-sm text-zinc-400">Aucune publication publique.</p> : (
              <ul className="mt-4 space-y-4">
                {publicPosts.map((post) => (
                  <li key={post.post_id} className="rounded-xl border border-zinc-800 bg-black/40 p-4">
                    <p className="text-sm text-zinc-400">{post.display_name} · {formatDate(post.created_at)}</p>
                    <p className="mt-3 whitespace-pre-wrap break-words text-zinc-100">{post.body}</p>
                    <button type="button" disabled={busyItem === post.post_id} onClick={() => void moderate("post", post.post_id, "hidden")} className="mt-4 rounded-lg bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/25 disabled:opacity-50">Masquer</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-10">
            <h2 className="text-xl font-semibold">Commentaires visibles (100 derniers)</h2>
            {publicComments.length === 0 ? <p className="mt-3 text-sm text-zinc-400">Aucun commentaire public.</p> : (
              <ul className="mt-4 space-y-4">
                {publicComments.map((comment) => (
                  <li key={comment.comment_id} className="rounded-xl border border-zinc-800 bg-black/40 p-4">
                    <p className="text-sm text-zinc-400">{comment.display_name} · {formatDate(comment.created_at)}</p>
                    <p className="mt-2 text-xs text-zinc-500">Publication : {comment.post_id}</p>
                    <p className="mt-3 whitespace-pre-wrap break-words text-zinc-100">{comment.body}</p>
                    <button type="button" disabled={busyItem === comment.comment_id} onClick={() => void moderate("comment", comment.comment_id, "hidden")} className="mt-4 rounded-lg bg-amber-500/15 px-4 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/25 disabled:opacity-50">Masquer</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  );
}
