import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./env";

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/auth", "/r/", "/setup", "/icon", "/apple-icon", "/pwa-icon", "/manifest.webmanifest", "/sw.js", "/api/cron/", "/offline", "/screenshots/"];

function isPublic(pathname: string): boolean {
  return pathname === "/" || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * Refreshes the Supabase session cookie before any route renders, and sends
 * signed-out visitors to /login. This is a convenience, not the security
 * boundary: every page and Server Action checks the user again, and RLS
 * checks every row.
 */
export async function updateSession(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    if (isPublic(request.nextUrl.pathname)) return NextResponse.next();
    return NextResponse.redirect(new URL("/setup", request.url));
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Verifies the JWT and refreshes it if it's about to expire. Nothing may run
  // between creating the client and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!signedIn && !isPublic(pathname)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname + search);
    return redirectWithCookies(url, response);
  }

  if (signedIn && (pathname === "/" || pathname === "/login" || pathname === "/signup")) {
    return redirectWithCookies(new URL("/dashboard", request.url), response);
  }

  return response;
}

// A redirect must carry any refreshed session cookies, or the user is
// signed out on the next request.
function redirectWithCookies(url: URL, from: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
