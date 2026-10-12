import { createFileRoute } from "@tanstack/react-router";
import {
  ALLOWED_CHAINS, type LinkChain, chainForPath, checkXprvMatches, delegateMessage, json,
  linkDomainFor, openSealed, parseExtKey, payloadSha256, validAccount, verifyTxcMessage,
} from "@/lib/hme-link.server";
import { decryptDelegatedKey, encryptDelegatedKey } from "@/lib/delegation.server";

type Body = {
  token?: string; mode?: string; account?: number; paths?: string[]; identity_address?: string;
  signature?: string; message?: string; payload?: string; xpubs?: Record<string, string>;
};

export const Route = createFileRoute("/api/public/hme-link/submit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let b: Body;
        try { b = (await request.json()) as Body; } catch { return json({ error: "bad json" }, 400); }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (!b.token || !/^[A-Za-z0-9_-]{8,64}$/.test(b.token)) return json({ error: "bad token" }, 400);
        if (b.mode !== "access" && b.mode !== "approve") return json({ error: "bad mode" }, 400);
        if (!validAccount(b.account)) return json({ error: "bad account" }, 400);
        if (!Array.isArray(b.paths) || b.paths.length === 0 || b.paths.length > 5) return json({ error: "bad paths" }, 400);
        if (!b.identity_address || !b.signature || typeof b.message !== "string") return json({ error: "missing signature" }, 400);

        const { data: req } = await supabaseAdmin.from("hme_link_requests").select("*").eq("challenge_id", b.token).maybeSingle();
        if (!req || req.consumed_at || new Date(req.expires_at) < new Date()) return json({ error: "expired" }, 410);

        // Paths: allowed chains only, all on the account the wallet reports.
        const chains: LinkChain[] = [];
        for (const p of b.paths) {
          const c = chainForPath(p);
          if (!c || c.account !== b.account || chains.includes(c.chain)) return json({ error: `refused path ${p}` }, 400);
          chains.push(c.chain);
        }
        const xpubs: Record<string, string> = {};
        for (const c of chains) {
          const x = b.xpubs?.[c];
          if (!x) return json({ error: `missing xpub ${c}` }, 400);
          try { parseExtKey(c, x); } catch { return json({ error: `bad xpub ${c}` }, 400); }
          xpubs[c] = x;
        }

        const payloadSha = b.mode === "access" ? (b.payload ? payloadSha256(b.payload) : "") : "none";
        if (b.mode === "access" && !payloadSha) return json({ error: "missing payload" }, 400);
        const expected = delegateMessage({ domain: linkDomainFor(request), challenge: req.challenge, mode: b.mode, paths: b.paths, payloadSha });
        if (b.message !== expected) return json({ error: "message mismatch" }, 400);
        if (!verifyTxcMessage(b.identity_address, b.message, b.signature)) return json({ error: "bad signature" }, 401);

        let keyCiphertext: string | null = null;
        if (b.mode === "access") {
          let xprvs: Record<string, string>;
          try {
            const plain = openSealed(b.payload!, decryptDelegatedKey(req.recipient_priv_ciphertext), req.recipient_pubkey);
            xprvs = JSON.parse(plain);
          } catch { return json({ error: "cannot open payload" }, 400); }
          for (const c of chains) {
            if (!xprvs[c] || !checkXprvMatches(c, xprvs[c], xpubs[c])) return json({ error: `xprv mismatch ${c}` }, 400);
          }
          const keep: Record<string, string> = {};
          for (const c of ALLOWED_CHAINS) if (xprvs[c] && chains.includes(c)) keep[c] = xprvs[c];
          keyCiphertext = encryptDelegatedKey(JSON.stringify(keep));
        }

        // Burn challenge first (single use), then retire any previous link.
        const { data: burned } = await supabaseAdmin.from("hme_link_requests")
          .update({ consumed_at: new Date().toISOString() }).eq("challenge_id", b.token).is("consumed_at", null).select("challenge_id");
        if (!burned?.length) return json({ error: "already used" }, 409);

        await supabaseAdmin.from("hme_links")
          .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: "replaced", key_ciphertext: null })
          .eq("user_id", req.user_id).eq("status", "active");

        const { data: link, error } = await supabaseAdmin.from("hme_links").insert({
          user_id: req.user_id, mode: b.mode, account: b.account!, paths: b.paths,
          identity_address: b.identity_address, xpubs, key_ciphertext: keyCiphertext,
        }).select("id").single();
        if (error || !link) return json({ error: "store failed" }, 500);
        return json({ linked_to: "Seeds Exchange", link_id: link.id });
      },
    },
  },
});
