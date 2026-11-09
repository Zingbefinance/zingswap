"use client";

import { useState, type FormEvent } from "react";

import { getCommunityErrorMessage } from "@/lib/community/errors";
import { createClient } from "@/lib/supabase/client";

type ReportFormProps = {
  userId: string | null;
  targetType: "post" | "comment";
  targetId: string;
};

const reportReasons = [
  ["spam", "Spam"],
  ["scam", "Arnaque"],
  ["abuse", "Harcèlement ou contenu abusif"],
  ["impersonation", "Usurpation d’identité"],
  ["other", "Autre"],
] as const;

export default function ReportForm({ userId, targetType, targetId }: ReportFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reason, setReason] = useState<(typeof reportReasons)[number][0]>("spam");
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!userId) {
      setError("Connecte-toi pour signaler ce contenu.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const targetFields = targetType === "post"
        ? { post_id: targetId }
        : { comment_id: targetId };
      const { error: reportError } = await supabase.from("reports").insert({
        reporter_id: userId,
        ...targetFields,
        target_type: targetType,
        target_id: targetId,
        reason,
        details: details.trim() || null,
      });
      if (reportError) throw reportError;
      setMessage("Signalement transmis à l’équipe de modération.");
      setDetails("");
      setIsOpen(false);
    } catch (reportError) {
      setError(getCommunityErrorMessage(reportError, "Le signalement n’a pas pu être transmis"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => {
          setIsOpen((current) => !current);
          setError("");
        }}
        className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
      >
        Signaler
      </button>
      {isOpen && (
        <form onSubmit={submitReport} className="mt-3 space-y-3 rounded-xl border border-zinc-800 bg-black/30 p-4">
          <label className="block text-sm text-zinc-300">
            Motif
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value as (typeof reportReasons)[number][0])}
              className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            >
              {reportReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block text-sm text-zinc-300">
            Détails facultatifs
            <textarea
              maxLength={1000}
              rows={3}
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              className="mt-1.5 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white"
            />
          </label>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setIsOpen(false)} className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
              Annuler
            </button>
            <button type="submit" disabled={isSubmitting} className="rounded-lg bg-cyan-400 px-3 py-2 text-sm font-semibold text-zinc-950 disabled:opacity-60">
              {isSubmitting ? "Envoi…" : "Envoyer le signalement"}
            </button>
          </div>
        </form>
      )}
      {message && <p role="status" className="mt-2 text-sm text-emerald-300">{message}</p>}
    </div>
  );
}
