import AuthForm from "../_components/AuthForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const confirmationError = params.error === "confirmation";
  return <AuthForm mode="login" initialMessage={confirmationError ? "Le lien de confirmation est invalide ou a expiré. Demande un nouveau lien en te réinscrivant." : ""} />;
}
