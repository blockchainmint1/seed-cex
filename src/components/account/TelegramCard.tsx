import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Send } from "lucide-react";
import { SEEDS_BOT_URL, SEEDS_BOT_USERNAME } from "@/lib/telegram-bot";
import { getMyProfile, sendTestAlert, startTelegramConnect, unlinkTelegram } from "@/lib/profile.functions";
import { Button } from "@/components/ui/button";
import { Card, Note } from "@/components/account/ui";
import { CodeField } from "@/components/account/CodeField";
import { useMyTwoFactor } from "@/components/account/TwoFactorCard";
import { proveTwoFactor } from "@/components/account/two-factor";

/** One-tap Telegram linking, shared by Account → Alerts and the setup guide. */
export function TelegramCard({ title = "Telegram", desc }: { title?: string; desc?: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getMyProfile);
  const connect = useServerFn(startTelegramConnect);
  const unlink = useServerFn(unlinkTelegram);
  const test = useServerFn(sendTestAlert);
  const [tgWaitUrl, setTgWaitUrl] = useState<string | null>(null);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => load(), refetchInterval: (q) => (tgWaitUrl && !q.state.data?.telegram_verified ? 3000 : false) });
  const p = profile.data;
  const [tgNote, setTgNote] = useState<{ ok: boolean; text: string } | null>(null);
  // Telegram approves coins leaving the pocket, so with two-factor on, changing it needs a fresh code.
  const twoFactorOn = Boolean(useMyTwoFactor().data);
  const [code, setCode] = useState("");
  const [askUnlink, setAskUnlink] = useState(false);
  const codeReady = !twoFactorOn || code.length === 6;
  useEffect(() => {
    if (tgWaitUrl && p?.telegram_verified) { setTgWaitUrl(null); setTgNote({ ok: true, text: "Telegram linked. Alerts are on." }); }
  }, [tgWaitUrl, p?.telegram_verified]);

  const tg = useMutation({
    mutationFn: async (action: "unlink" | "test") => {
      if (action === "test") return test();
      if (twoFactorOn) await proveTwoFactor(code);
      return unlink();
    },
    onSuccess: (_r, action) => {
      setTgNote({ ok: true, text: action === "unlink" ? "Telegram unlinked." : "Test alert sent." });
      if (action === "unlink") setAskUnlink(false);
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e: Error) => setTgNote({ ok: false, text: e.message }),
    onSettled: () => setCode(""),
  });

  async function startConnect() {
    // Open the tab during the click so phones don't block it, then point it at Telegram.
    const tab = window.open("", "_blank");
    try {
      if (twoFactorOn) await proveTwoFactor(code);
      const { url } = await connect();
      setTgWaitUrl(url);
      setTgNote(null);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (e) {
      tab?.close();
      setTgNote({ ok: false, text: e instanceof Error ? e.message : "Couldn't start Telegram linking." });
    } finally {
      setCode("");
    }
  }

  return (
    <Card title={title} desc={desc ?? `Alerts come from @${SEEDS_BOT_USERNAME}.`}>
      {tgNote ? <div className="mb-3"><Note tone={tgNote.ok ? "ok" : "error"}>{tgNote.text}</Note></div> : null}
      {p?.telegram_verified ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 font-mono text-xs text-primary"><Check className="h-3.5 w-3.5" /> Linked to chat {p.telegram_chat_id}</span>
          <Button size="sm" variant="outline" disabled={tg.isPending} onClick={() => tg.mutate("test")}><Send /> Send test</Button>
          <Button size="sm" variant="ghost" disabled={tg.isPending} onClick={() => (twoFactorOn ? setAskUnlink(true) : tg.mutate("unlink"))}>Unlink</Button>
          {askUnlink && twoFactorOn ? (
            <div className="basis-full space-y-2 rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground">Telegram is where you approve coins leaving your pocket, so unlinking needs your code.</p>
              <CodeField id="tg-unlink-code" value={code} onChange={setCode} />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={!codeReady || tg.isPending} onClick={() => tg.mutate("unlink")}>Unlink Telegram</Button>
                <Button size="sm" variant="ghost" onClick={() => { setAskUnlink(false); setCode(""); }}>Cancel</Button>
              </div>
            </div>
          ) : null}
          <p className="basis-full text-xs text-muted-foreground">
            Not getting alerts? Open <a href={SEEDS_BOT_URL} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">@{SEEDS_BOT_USERNAME}</a>, tap Start, then Send test.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {twoFactorOn ? (
            <>
              <CodeField id="tg-connect-code" value={code} onChange={setCode} />
              <p className="text-xs text-muted-foreground">Telegram is where you approve coins leaving your pocket, so connecting it needs your code.</p>
            </>
          ) : null}
          <Button onClick={startConnect} disabled={!codeReady}><Send /> Connect Telegram</Button>
          <p className="text-xs text-muted-foreground">
            {tgWaitUrl ? (
              <>Waiting for you to tap <b>Start</b> in Telegram… This page updates by itself.{" "}
                <a href={tgWaitUrl} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-4">Open Telegram again</a></>
            ) : <>Opens @{SEEDS_BOT_USERNAME} in Telegram. Tap Start and you're done.</>}
          </p>
        </div>
      )}
    </Card>
  );
}
