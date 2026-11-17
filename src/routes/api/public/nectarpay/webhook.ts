import { createFileRoute } from "@tanstack/react-router";

// NectarPay signed invoice events (nectar-pay.com/api §6). Settle only on invoice.confirmed, re-checked against the API.
export const Route = createFileRoute("/api/public/nectarpay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { verifyNectarSignature, getInvoice } = await import("@/lib/nectarpay.server");
        const ok = await verifyNectarSignature(request.headers.get("x-txcpay-signature"), raw, process.env.NECTARPAY_WEBHOOK_SECRET ?? "");
        if (!ok) return new Response("Unauthorized", { status: 401 });
        let ev: { id?: string; type?: string; data?: { invoice_id?: string; order_id?: string | null; chain?: string; paid_amount_usd?: number } };
        try { ev = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }
        if (!ev.id || !ev.type || !ev.data?.invoice_id) return new Response("Bad request", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: dup } = await supabaseAdmin.from("nectarpay_events").insert({ event_id: ev.id, type: ev.type, invoice_id: ev.data.invoice_id, payload: ev as never });
        if (dup) return Response.json({ ok: true, duplicate: true });

        try {
        const { data: reg } = await supabaseAdmin.from("ignite_registrations").select("id, user_id, status, hm_member_id, email, amount_usd").eq("invoice_id", ev.data.invoice_id).maybeSingle();
        if (!reg) return Response.json({ ok: true, ignored: true });

        if (ev.type === "invoice.underpaid" && reg.status === "pending") {
          await supabaseAdmin.from("ignite_registrations").update({ status: "underpaid", updated_at: new Date().toISOString() }).eq("id", reg.id);
        }
        if (ev.type === "invoice.confirmed" && reg.status !== "confirmed") {
          const inv = await getInvoice(ev.data.invoice_id);
          if (!["confirmed", "overpaid"].includes(inv.status) || Number(inv.fiat_amount) < Number(reg.amount_usd)) return Response.json({ ok: true, unverified: true });
          await supabaseAdmin.from("ignite_registrations").update({
            status: "confirmed", confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            paid_chain: ev.data.chain ?? null, paid_amount_usd: ev.data.paid_amount_usd ?? null,
          }).eq("id", reg.id);
          const { notifyUser } = await import("@/lib/telegram.server");
          await notifyUser(reg.user_id, "notify_p2p", "✅ Your Seeds Ignite seat is confirmed. See you Nov 30, 5:00 PM CST.");
          const { sendHubEvent } = await import("@/lib/hme-hub.server");
          await sendHubEvent({ event: "purchase", member_id: reg.hm_member_id, email: reg.email, metadata: { product: "ignite_seat", amount_usd: Number(reg.amount_usd) } });
        }
        return Response.json({ ok: true });
        } catch (e) {
          // Let NectarPay's retry reprocess this event.
          await supabaseAdmin.from("nectarpay_events").delete().eq("event_id", ev.id);
          console.error("NectarPay webhook failed", e);
          return new Response("Retry", { status: 500 });
        }
      },
    },
  },
});
