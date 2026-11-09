type SupabaseErrorFields = {
  code?: unknown;
  name?: unknown;
  status?: unknown;
  statusCode?: unknown;
};

function getErrorFields(error: unknown): SupabaseErrorFields {
  if (!error || typeof error !== "object") return {};
  return error as SupabaseErrorFields;
}

export function getCommunityErrorMessage(error: unknown, fallback: string) {
  const fields = getErrorFields(error);
  const rawCode = typeof fields.code === "string" ? fields.code : "";
  const code = /^[A-Za-z0-9_.-]{1,40}$/.test(rawCode) ? rawCode : "";
  const errorName = typeof fields.name === "string" ? fields.name : "";
  const statusValue = fields.status ?? fields.statusCode;
  const status = typeof statusValue === "number"
    ? statusValue
    : typeof statusValue === "string" && /^\d{3}$/.test(statusValue)
      ? Number(statusValue)
      : null;

  let guidance = "";
  if (["42P01", "42703", "42883", "PGRST202", "PGRST204", "PGRST205"].includes(code)) {
    guidance = "Le schéma Community est incomplet ou son cache API doit être actualisé. Vérifie les migrations 3 à 6.";
  } else if (code === "42501" || status === 401 || status === 403) {
    guidance = "Supabase a refusé l’opération. Vérifie la session et les autorisations prévues par RLS.";
  } else if (code === "BucketNotFound") {
    guidance = "Le bucket d’images Community est introuvable. Vérifie la migration 6 et la configuration Storage.";
  } else if (status === 413) {
    guidance = "L’image dépasse la limite de taille acceptée par le stockage.";
  } else if (status === 415) {
    guidance = "Le stockage a refusé le format de l’image.";
  } else if (code === "23505") {
    guidance = "Cette action existe déjà pour ce compte.";
  } else if (code === "23503") {
    guidance = "La publication ciblée n’est plus disponible.";
  } else if (error instanceof TypeError || errorName === "AuthRetryableFetchError") {
    guidance = "Impossible de joindre Supabase. Vérifie la connexion réseau et l’URL locale configurée.";
  }

  const reference = code ? `Code ${code}` : status ? `HTTP ${status}` : "Aucun code Supabase reçu";
  return `${guidance || fallback} (${reference}).`;
}
