import { createFileRoute } from "@tanstack/react-router";
import { cleanRefCode, referralUrl } from "@/lib/ignite-registration";

// Short invite link members share: seeds.honest.money/invite/{code}.
// Forwards through honest.money/r/{code} so Honest.Money counts the click and
// credits the referrer, then lands on /to-the-moon?ref={code}. The destination is
// fixed; only a validated referral code is substituted, so this can't be used
// to bounce visitors to another site.
export const Route = createFileRoute("/invite/$code")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const code = cleanRefCode(params.code);
        const to = code ? referralUrl(code) : "/to-the-moon";
        const headers = new Headers({ Location: to, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
        if (code) {
          // Admin → Affiliates: count the click (people only, capped) and keep Seeds' own first-touch copy of the code.
          const { countInviteClick } = await import("@/lib/affiliates.server");
          await countInviteClick(request.headers, code);
          if (!/(?:^|;\s*)seeds_ref=/.test(request.headers.get("cookie") ?? ""))
            headers.append("Set-Cookie", `seeds_ref=${encodeURIComponent(code)}; Max-Age=2592000; Path=/; Secure; SameSite=Lax`);
        }
        return new Response(null, { status: 302, headers });
      },
    },
  },
});
