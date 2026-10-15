import { NextResponse, type NextRequest } from "next/server";
import { decrypt, SESSION_COOKIE } from "@/lib/session";

const PUBLIC_PATHS = ["/login", "/report", "/setup", "/api/cron"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const session = await decrypt(req.cookies.get(SESSION_COOKIE)?.value);

  if (!session && !isPublic) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  // Drivers only see their own portal (and the public pages).
  if (session?.role === "DRIVER" && !isPublic && !pathname.startsWith("/me") && pathname !== "/logout" && pathname !== "/welcome") {
    return NextResponse.redirect(new URL("/me", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
