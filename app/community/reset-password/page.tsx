import { redirect } from "next/navigation";

import ResetPasswordForm from "../_components/ResetPasswordForm";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/community/login");

  return <ResetPasswordForm />;
}
