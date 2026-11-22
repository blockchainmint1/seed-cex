import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { TRACKED_HOSTS, isBotUA, isSameOriginRequest } from "@/lib/site-traffic";
import { ERRORS_PER_MINUTE, errorReportAllowed, hostKind, ignoredError, scrubErrorMessage, scrubErrorSource, signatureBase } from "@/lib/qa/error-log-rules";
import { cleanText, describeDevice, scrubPagePath } from "@/lib/qa/qa-rules";

// Seeds' own error log (Admin → Bugs → Errors): browser errors nobody reported.
// Public by design (any page may hit an error), so it is same-origin only, capped per
// connection, re-scrubs everything the browser sent, stores no IP, and keeps an account id
// only when a valid sign-in token comes with it. Nothing goes to an outside service.
const schema = z.object({
  kind: z.enum(["error", "rejection"]),
  message: z.string().max(2000),
  file: z.string().max(1000).optional(),
  line: z.number().int().nonnegative().optional(),
  col: z.number().int().nonnegative().optional(),
  page: z.string().max(2000),
  viewport: z.string().max(40).optional(),
  appVersion: z.string().max(80).optional(),
});
const LIVE = new Set<string>([...TRACKED_HOSTS]);
const noContent = () => new Response(null, { status: 204 });

async function accountFrom(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token || token.split(".").length !== 3) return null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.getClaims(token);
    const sub = data?.claims?.sub;
    return typeof sub === "string" && /^[0-9a-f-]{36}$/i.test(sub) ? sub : null;
  } catch { return null; }
}

export const Route = createFileRoute("/api/public/client-error")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isSameOriginRequest(request)) return new Response("Forbidden", { status: 403 });
        const text = await request.text().catch(() => "");
        if (text.length > 6000) return new Response("Too large", { status: 413 });
        let body: unknown;
        try { body = JSON.parse(text); } catch { return new Response("Bad request", { status: 400 }); }
        const parsed = schema.safeParse(body);
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const d = parsed.data;
        const ua = request.headers.get("user-agent") ?? "";
        if (isBotUA(ua)) return noContent();
        const url = new URL(request.url);
        // The page's own origin (already checked same-origin); behind the preview proxy request.url may differ.
        const origin = (() => { try { return new URL(request.headers.get("origin") ?? url.origin).origin; } catch { return url.origin; } })();
        const page = scrubPagePath(d.page);
        if (!errorReportAllowed(page.split("?")[0] ?? "/")) return noContent();
        const message = scrubErrorMessage(d.message);
        if (!message || ignoredError(message)) return noContent();

        const { errorLogEnabled } = await import("@/lib/qa/qa.server");
        if (!(await errorLogEnabled())) return noContent();
        const { ipAllowed } = await import("@/lib/ip-rate.server");
        if (!(await ipAllowed("client-error", request.headers, ERRORS_PER_MINUTE))) return new Response("Too many requests", { status: 429 });

        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(signatureBase(d.kind, message))));
        const signature = Array.from(digest.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
        const device = describeDevice(ua);
        const host = hostKind(new URL(origin).hostname, LIVE);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: outcome, error } = await supabaseAdmin.rpc("record_client_error", {
          _signature: signature, _kind: d.kind, _message: message,
          _source: scrubErrorSource(d.file, d.line, d.col, origin), _page: page,
          _browser: cleanText(device.browser, 80), _os: cleanText(device.os, 80),
          _viewport: cleanText(d.viewport ?? "", 40), _version: cleanText(d.appVersion ?? "", 80),
          // null = a visitor (the generated type lists the argument as text only)
          _host: host, _account: (await accountFrom(request)) as unknown as string,
        });
        if (error) { console.error("[client-error] record failed", error.message); return noContent(); }
        if (outcome === "alert_new" || outcome === "alert_back") {
          const { postToQaGroup } = await import("@/lib/qa/qa.server");
          const { errorAlertText } = await import("@/lib/qa/error-log-rules");
          await postToQaGroup(errorAlertText({
            back: outcome === "alert_back", message, pagePath: page, host,
            device: [device.browser, device.os].filter(Boolean).join(" · "), link: `${origin}/admin/bugs/errors`,
          }));
        }
        if (Math.random() < 0.01) await supabaseAdmin.rpc("client_errors_prune").then(() => undefined, () => undefined);
        return noContent();
      },
    },
  },
});
