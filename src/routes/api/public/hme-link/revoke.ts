import { createFileRoute } from "@tanstack/react-router";
import { json, linkDomainFor, revokeMessagePrefix, verifyTxcMessage } from "@/lib/hme-link.server";

export const Route = createFileRoute("/api/public/hme-link/revoke")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        let b: { link_id?: string; identity_address?: string; signature?: string; message?: string };
        try { b = await request.json(); } catch { return json({ error: "bad json" }, 400); }
        if (!b.link_id || !b.identity_address || !b.signature || typeof b.message !== "string") return json({ error: "missing fields" }, 400);
        const prefix = revokeMessagePrefix(linkDomainFor(request), b.link_id);
        if (!b.message.startsWith(prefix)) return json({ error: "message mismatch" }, 400);
        const issued = Date.parse(b.message.slice(prefix.length).trim());
        if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > 15 * 60_000) return json({ error: "stale" }, 400);
        if (!verifyTxcMessage(b.identity_address, b.message, b.signature)) return json({ error: "bad signature" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: link } = await supabaseAdmin.from("hme_links").select("id, user_id, identity_address, status, account, paths, xpubs").eq("id", b.link_id).maybeSingle();
        if (!link || link.identity_address !== b.identity_address) return json({ error: "unknown link" }, 404);
        if (link.status === "active") {
          await supabaseAdmin.from("hme_links")
            .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: "wallet", key_ciphertext: null })
            .eq("id", link.id);
          await supabaseAdmin.from("hme_trade_proposals").update({ status: "expired" }).eq("link_id", link.id).eq("status", "pending");
          const { emailAccountChange } = await import("@/lib/email/send.server");
          const { extraPocketAddresses } = await import("@/lib/pockets/extra-addresses.server");
          const { recoveryLines } = await import("@/lib/pockets/hme-support");
          await emailAccountChange(link.user_id, "HME Wallet link", [
            "Revoked from HME Wallet. Seeds deleted its access to your trading pocket.",
            ...strandedNotice(recoveryLines(link.account, extraPocketAddresses(link))),
          ]);
        }
        return json({ revoked: true });
      },
    },
  },
});

/** Extra-coin pockets HME Wallet can't move back: tell the member exactly where they were. */
function strandedNotice(lines: string[]): string[] {
  if (!lines.length) return [];
  return [
    "HME Wallet can't hold or move these coins. If you left any in them, import your recovery phrase into a wallet that supports that coin and use the path shown:",
    ...lines,
  ];
}
