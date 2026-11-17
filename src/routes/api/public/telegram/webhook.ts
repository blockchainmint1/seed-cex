import { createFileRoute } from "@tanstack/react-router";

// Updates from @seeds_notify_bot. Only Telegram knows the secret header; "/start <code>" links a member's chat.
export const Route = createFileRoute("/api/public/telegram/webhook")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleTelegramUpdate, telegramWebhookSecret } = await import("@/lib/telegram.server");
        const expected = await telegramWebhookSecret();
        const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        let diff = got.length ^ expected.length;
        for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ (got.charCodeAt(i) || 0);
        if (diff !== 0 || !process.env.TELEGRAM_API_KEY) return new Response("Unauthorized", { status: 401 });
        let update: Parameters<typeof handleTelegramUpdate>[0];
        try { update = await request.json(); } catch { return Response.json({ ok: true }); }
        try {
          return Response.json({ ok: true, result: await handleTelegramUpdate(update) });
        } catch (e) {
          console.error("[telegram] update failed", e instanceof Error ? e.message : e);
          return Response.json({ ok: true }); // never make Telegram retry-loop
        }
      },
    },
  },
});
