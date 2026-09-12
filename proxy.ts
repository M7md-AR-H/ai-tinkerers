import { NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

const auth0Configured = !!(
  process.env.AUTH0_DOMAIN &&
  process.env.AUTH0_CLIENT_ID &&
  process.env.AUTH0_CLIENT_SECRET
);

export async function proxy(request: Request) {
  // Without Auth0 keys the SDK throws on every request; keep the public agent pages usable until they're added.
  if (!auth0Configured) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/auth/") && pathname !== "/auth/demo") {
      return new NextResponse(
        "Auth0 isn't configured yet: fill AUTH0_DOMAIN, AUTH0_CLIENT_ID and AUTH0_CLIENT_SECRET in .env.local, then restart the dev server.",
        { status: 503 }
      );
    }
    return NextResponse.next();
  }
  return await auth0.middleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)"],
};
