import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  if (pathname === "/community/feed" || pathname === "/community/feed/") {
    return NextResponse.next();
  }

  return updateSession(request);
}

export const config = {
  matcher: ["/community/:path*"],
};
