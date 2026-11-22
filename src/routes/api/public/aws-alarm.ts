import { createFileRoute } from "@tanstack/react-router";

/**
 * Amazon SNS → Seeds Telegram group (audit M1). AWS CloudWatch alarms on the pocket-key KMS key
 * publish to one SNS topic; this page accepts only messages signed by SNS for exactly that topic
 * (SEEDS_ALARM_SNS_TOPIC_ARN), confirms the subscription once, and posts alarms to the group.
 * It never changes anything else; the alarm also reaches the team by email/text straight from AWS.
 */
export const Route = createFileRoute("/api/public/aws-alarm")({
  staticData: { sitemap: false },
  server: {
    handlers: {
      POST: async ({ request }) => {
        const topic = process.env.SEEDS_ALARM_SNS_TOPIC_ARN?.trim();
        // 404 (not 503) while the alarm topic isn't configured: the page is simply not switched on yet.
        if (!topic) return new Response("Not set up", { status: 404 });
        const raw = await request.text();
        if (raw.length > 64_000) return new Response("Too large", { status: 413 });
        const { parseSnsMessage, snsFresh, isSnsUrl, alarmText } = await import("@/lib/aws-alarm/sns");
        let body: unknown;
        try { body = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }
        const m = parseSnsMessage(body);
        // Cheap checks first, so random posts never make Seeds fetch anything.
        if (!m || m.TopicArn !== topic || !snsFresh(m.Timestamp, Date.now())) return new Response("Unauthorized", { status: 401 });
        const { verifySnsSignature } = await import("@/lib/aws-alarm/sns.server");
        if (!(await verifySnsSignature(m))) return new Response("Unauthorized", { status: 401 });

        if (m.Type === "SubscriptionConfirmation") {
          if (!isSnsUrl(m.SubscribeURL, "subscribe")) return new Response("Unauthorized", { status: 401 });
          const r = await fetch(m.SubscribeURL!, { signal: AbortSignal.timeout(5_000), redirect: "error" });
          console.log("[aws-alarm] subscription confirm", r.status);
          return Response.json({ ok: r.ok });
        }
        if (m.Type !== "Notification") return Response.json({ ok: true });

        const text = alarmText(m.Message);
        if (!text) return Response.json({ ok: true, posted: false });
        const { postToQaGroup } = await import("@/lib/qa/qa.server");
        let posted = await postToQaGroup(text);
        if (!posted) {
          const { alertAdmins } = await import("@/lib/alerts.server");
          await alertAdmins(text).then(() => { posted = true; }).catch((e) => console.error("[aws-alarm] admin alert failed", e));
        }
        return Response.json({ ok: true, posted });
      },
    },
  },
});
