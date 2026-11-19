import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Audit 2026-11-19 M5: the zod advisory is about validating oversized collections, and there is
// no 3.x fix. Every list input carries a .max(), and server-function bodies are capped here so an
// oversized payload is refused before anything parses it. 12 MB fits the largest input (P2P receipt).
const MAX_SERVER_FN_BODY = 12_000_000;
const bodyCapMiddleware = createMiddleware().server(async ({ request, next }) => {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (request.method !== "GET" && new URL(request.url).pathname.startsWith("/_serverFn") && len > MAX_SERVER_FN_BODY) {
    return new Response("Request too large", { status: 413 });
  }
  return next();
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware, bodyCapMiddleware, csrfMiddleware],
}));
