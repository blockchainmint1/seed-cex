import { createFileRoute } from "@tanstack/react-router";
import { cleanRefCode, referralUrl } from "@/lib/ignite-registration";

// Short invite link members share: seeds.honest.money/invite/{code}.
// Forwards through honest.money/r/{code} so Honest.Money counts the click and
// credits the referrer, then lands on /register?ref={code}. The destination is
// fixed; only a validated referral code is substituted, so this can't be used
// to bounce visitors to another site.
export const Route = createFileRoute("/invite/$code")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      GET: async ({ params }) => {
        const code = cleanRefCode(params.code);
        const to = code ? referralUrl(code) : "/register";
        return new Response(null, {
          status: 302,
          headers: { Location: to, "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
        });
      },
    },
  },
});
