import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

function safeCommunityPath(value: string | null) {
  if (!value || !value.startsWith("/community/") || value.startsWith("//") || value.includes("\\")) {
    return "/community/profile";
  }
  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/community/login?error=confirmation", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL("/community/login?error=confirmation", request.url));
  }

  return NextResponse.redirect(new URL(safeCommunityPath(requestUrl.searchParams.get("next")), request.url));
}
