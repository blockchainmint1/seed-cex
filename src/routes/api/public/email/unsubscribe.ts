import { createFileRoute } from "@tanstack/react-router";
import { readUnsubToken } from "@/lib/email/links";

const page = (title: string, body: string, form = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} · Seeds</title><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700&display=swap">
<style>body{margin:0;padding:0 16px;background:#FFF8E8;font-family:Manrope,ui-sans-serif,system-ui,sans-serif;color:#00170F}main{max-width:440px;margin:12vh auto;padding:32px;background:#fff;border:1px solid #E7DEC8;border-radius:16px}h1{font-size:22px;margin:0 0 12px;color:#002419}p{line-height:1.55;color:#3F4A44}button{margin-top:8px;background:#19ED50;color:#002419;border:0;border-radius:10px;padding:12px 18px;font:600 15px Manrope,system-ui,sans-serif;cursor:pointer}a{color:#002419}</style></head>
<body><main><h1>${title}</h1><p>${body}</p>${form}<p style="font-size:13px;margin-top:24px">Trade and security emails aren't affected. Manage everything on your <a href="https://seeds.honest.money/account/alerts">Seeds profile</a>.</p></main></body></html>`;
const html = (s: string, status = 200) => new Response(s, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function secret() {
  const s = process.env.EMAIL_LINK_SECRET;
  if (!s) throw new Error("EMAIL_LINK_SECRET missing");
  return s;
}

async function optOut(token: string | null): Promise<boolean> {
  const t = token ? readUnsubToken(secret(), token) : null;
  if (!t) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("profiles").update({ email_weekly_update: false }).eq("id", t.userId);
  return !error;
}

// GET shows a confirm button (so link scanners can't unsubscribe people);
// POST does it — both from that button and from mail apps' RFC 8058 one-click.
export const Route = createFileRoute("/api/public/email/unsubscribe")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("t");
        if (!token || !readUnsubToken(secret(), token)) return html(page("Link not recognized", "This unsubscribe link is incomplete or has been changed. You can turn weekly emails off on your Seeds profile instead."), 400);
        return html(page("Stop weekly updates?", "You'll stop getting the Monday summary of your Seeds activity.",
          `<form method="post"><input type="hidden" name="t" value="${esc(token)}"><button type="submit">Unsubscribe</button></form>`));
      },
      POST: async ({ request }) => {
        let token = new URL(request.url).searchParams.get("t");
        if (!token) { try { token = String((await request.formData()).get("t") ?? ""); } catch { token = null; } }
        const ok = await optOut(token);
        return ok
          ? html(page("You're unsubscribed", "We won't send you weekly updates anymore. You can turn them back on any time from your profile."))
          : html(page("Link not recognized", "We couldn't match this link to an account. Turn weekly emails off on your Seeds profile instead."), 400);
      },
    },
  },
});
