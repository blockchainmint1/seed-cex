import { createFileRoute } from "@tanstack/react-router";

// NectarPay signed invoice events (nectar-pay.com/api §6). Settle only on invoice.confirmed, re-checked against the API.
export const Route = createFileRoute("/api/public/nectarpay/webhook")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { verifyNectarSignature } = await import("@/lib/nectarpay.server");
        const ok = await verifyNectarSignature(request.headers.get("x-txcpay-signature"), raw, process.env.NECTARPAY_WEBHOOK_SECRET ?? "");
        if (!ok) return new Response("Unauthorized", { status: 401 });
        let ev: { id?: string; type?: string; data?: { invoice_id?: string; order_id?: string | null; chain?: string; paid_amount_usd?: number } };
        try { ev = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }
        if (!ev.id || !ev.type || !ev.data?.invoice_id) return new Response("Bad request", { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: dup } = await supabaseAdmin.from("nectarpay_events").insert({ event_id: ev.id, type: ev.type, invoice_id: ev.data.invoice_id, payload: ev as never });
        if (dup) return Response.json({ ok: true, duplicate: true });

        try {
          const { processIgniteInvoiceEvent } = await import("@/lib/ignite-confirm.server");
          const result = await processIgniteInvoiceEvent(ev.type, { invoice_id: ev.data.invoice_id, chain: ev.data.chain, paid_amount_usd: ev.data.paid_amount_usd });
          return Response.json({ ok: true, result });
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
