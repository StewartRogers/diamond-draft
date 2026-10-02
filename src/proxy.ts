import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "dd_session";

const PUBLIC_PAGES = ["/login", "/setup"];
const PUBLIC_API_PREFIX = "/api/auth/";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    pathname.startsWith(PUBLIC_API_PREFIX)
  );
}

/**
 * CSRF defense-in-depth on top of SameSite=Lax: reject state-changing API
 * requests whose Origin header names a different host.
 */
function isCrossOriginWrite(request: NextRequest): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return true;
  }
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return originHost !== host;
}

function isApiPath(pathname: string): boolean {
  return pathname.startsWith("/api/");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isApiPath(pathname) && isCrossOriginWrite(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  if (isPublicPath(pathname)) return NextResponse.next();

  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession && isApiPath(pathname)) {
    return NextResponse.next();
  }

  if (!hasSession) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
