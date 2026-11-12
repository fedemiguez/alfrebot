import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/clerk";

const isProtectedRoute = createRouteMatcher([
  // /asistente es público: login Clerk ocurre in-chat al elegir web.
  // /asistente-v2-preview queda afuera a propósito (UI sin login).
  "/asistente-v1(.*)",
  "/probar(.*)",
]);

export default isClerkConfigured()
  ? clerkMiddleware(async (auth, req) => {
      if (isProtectedRoute(req)) {
        await auth.protect({
          unauthenticatedUrl: new URL("/sign-up", req.url).toString(),
        });
      }
    })
  : function proxy(_req: NextRequest) {
      return NextResponse.next();
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
