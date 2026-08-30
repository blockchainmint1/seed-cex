import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, KeyRound, Send, Wallet } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import {
  confirmTelegramLink,
  getMyProfile,
  sendTestAlert,
  startTelegramLink,
  unlinkTelegram,
  updateMyProfile,
  type Profile,
} from "@/lib/profile.functions";
import { PAIRS } from "@/lib/chains";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Account & Settings — Seeds" },
      {
        name: "description",
        content:
          "Manage your Seeds profile, Telegram trade alerts, trading defaults, authorization presets and API keys.",
      },
      { property: "og:title", content: "Account & Settings — Seeds" },
      {
        property: "og:description",
        content: "Telegram alerts, trading defaults and API key management for your Seeds account.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: AccountPage,
});

const NOTIFS = [
  ["notify_order_filled", "Order filled", "Your resting order got matched."],
  ["notify_settlement", "Settlement confirmed", "An on-chain leg confirmed."],
  ["notify_settlement_failed", "Settlement failed", "A leg failed and needs a retry."],
  ["notify_auth_expiring", "Authorization expiring", "A trading key is about to be wiped."],
  ["notify_deposit", "Deposit detected", "Funds landed in your trading branch."],
  ["notify_login", "New sign-in", "Someone signed into your account."],
  ["notify_weekly_digest", "Weekly digest", "A Sunday summary of your trading."],
] as const;

function Section({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-sm border border-border bg-surface p-6">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {desc ? <p className="mt-1 text-sm text-muted-foreground">{desc}</p> : null}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

const inputCls =
  "w-full rounded-sm border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary";

function AccountPage() {
  const qc = useQueryClient();
  const { user } = useSession();
  const load = useServerFn(getMyProfile);
  const save = useServerFn(updateMyProfile);
  const startLink = useServerFn(startTelegramLink);
  const confirmLink = useServerFn(confirmTelegramLink);
  const unlink = useServerFn(unlinkTelegram);
  const test = useServerFn(sendTestAlert);

  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => load() });
  const p = profile.data;

  const [form, setForm] = useState<Partial<Profile>>({});
  const [chatId, setChatId] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (p) setForm(p);
  }, [p]);

  const patch = (v: Partial<Profile>) => setForm((f) => ({ ...f, ...v }));

  const mutate = useMutation({
    mutationFn: (data: Record<string, unknown>) => save({ data }),
    onSuccess: () => {
      setErr(null);
      setMsg("Saved.");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e: Error) => {
      setMsg(null);
      setErr(e.message);
    },
  });

  const tg = useMutation({
    mutationFn: async (action: "start" | "confirm" | "unlink" | "test") => {
      if (action === "start") return startLink({ data: { chatId: chatId.trim() } });
      if (action === "confirm") return confirmLink({ data: { code: code.trim() } });
      if (action === "unlink") return unlink();
      return test();
    },
    onSuccess: (_r, action) => {
      setErr(null);
      setMsg(
        action === "start"
          ? "Code sent to Telegram."
          : action === "confirm"
            ? "Telegram linked."
            : action === "unlink"
              ? "Telegram unlinked."
              : "Test alert sent.",
      );
      setCode("");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e: Error) => {
      setMsg(null);
      setErr(e.message);
    },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-5 py-12">
      <header className="space-y-2">
        <p className="font-mono text-[11px] tracking-[0.28em] text-primary uppercase">Account</p>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Profile & settings</h1>
        <p className="font-mono text-xs text-muted-foreground">{user?.email}</p>
      </header>

      {msg ? (
        <p className="rounded-sm border border-primary/40 bg-primary/10 px-4 py-2 font-mono text-xs text-primary">
          {msg}
        </p>
      ) : null}
      {err ? (
        <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-4 py-2 font-mono text-xs text-destructive">
          {err}
        </p>
      ) : null}

      <Section title="Profile" desc="Only you can see this. Seeds never asks for identity documents.">
        <label className="block space-y-1">
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Display name
          </span>
          <input
            className={inputCls}
            value={form.display_name ?? ""}
            onChange={(e) => patch({ display_name: e.target.value })}
            placeholder="Anonymous grower"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Timezone
          </span>
          <input
            className={inputCls}
            value={form.timezone ?? "UTC"}
            onChange={(e) => patch({ timezone: e.target.value })}
            placeholder="America/Chicago"
          />
        </label>
        <button
          onClick={() =>
            mutate.mutate({
              display_name: form.display_name?.trim() || null,
              timezone: form.timezone?.trim() || "UTC",
            })
          }
          className="rounded-sm bg-primary px-4 py-2 font-mono text-xs font-semibold tracking-wider text-primary-foreground uppercase hover:opacity-90"
        >
          Save profile
        </button>
      </Section>

      <Section
        title="Telegram alerts"
        desc="Get pinged the moment an order fills or a settlement confirms. Message our bot first, then paste your chat ID here."
      >
        {p?.telegram_verified ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-sm border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-xs text-primary">
              <Check className="h-3.5 w-3.5" /> Linked to chat {p.telegram_chat_id}
            </span>
            <button
              onClick={() => tg.mutate("test")}
              className="inline-flex items-center gap-2 rounded-sm border border-border px-3 py-1.5 font-mono text-xs uppercase hover:border-primary hover:text-primary"
            >
              <Send className="h-3.5 w-3.5" /> Send test
            </button>
            <button
              onClick={() => tg.mutate("unlink")}
              className="rounded-sm border border-border px-3 py-1.5 font-mono text-xs uppercase hover:border-destructive hover:text-destructive"
            >
              Unlink
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={inputCls}
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="Telegram chat ID (e.g. 123456789)"
              />
              <button
                onClick={() => tg.mutate("start")}
                disabled={!chatId.trim() || tg.isPending}
                className="rounded-sm bg-primary px-4 py-2 font-mono text-xs font-semibold tracking-wider text-primary-foreground uppercase hover:opacity-90 disabled:opacity-50"
              >
                Send code
              </button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                className={inputCls}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code from Telegram"
              />
              <button
                onClick={() => tg.mutate("confirm")}
                disabled={code.trim().length !== 6 || tg.isPending}
                className="rounded-sm border border-border px-4 py-2 font-mono text-xs uppercase hover:border-primary hover:text-primary disabled:opacity-50"
              >
                Verify
              </button>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground">
              Find your chat ID by messaging @userinfobot on Telegram, then start a chat with the
              Seeds bot so it is allowed to message you.
            </p>
          </div>
        )}
      </Section>

      <Section title="Alert preferences" desc="Which events are worth a buzz.">
        <div className="space-y-3">
          {NOTIFS.map(([key, label, hint]) => (
            <label key={key} className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[var(--primary)]"
                checked={Boolean(form[key])}
                onChange={(e) => patch({ [key]: e.target.checked } as Partial<Profile>)}
              />
              <span>
                <span className="block text-sm text-foreground">{label}</span>
                <span className="block font-mono text-[11px] text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </div>
        <button
          onClick={() =>
            mutate.mutate(Object.fromEntries(NOTIFS.map(([k]) => [k, Boolean(form[k])])))
          }
          className="rounded-sm bg-primary px-4 py-2 font-mono text-xs font-semibold tracking-wider text-primary-foreground uppercase hover:opacity-90"
        >
          Save alerts
        </button>
      </Section>

      <Section
        title="Trading defaults"
        desc="Pre-fills the authorization form and the order ticket. It never raises a cap on its own."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Default authorization cap
            </span>
            <input
              className={inputCls}
              inputMode="decimal"
              value={form.default_auth_cap ?? ""}
              onChange={(e) =>
                patch({ default_auth_cap: e.target.value ? Number(e.target.value) : null })
              }
              placeholder="500"
            />
          </label>
          <label className="block space-y-1">
            <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Default expiry (hours)
            </span>
            <input
              className={inputCls}
              inputMode="numeric"
              value={form.default_auth_hours ?? 24}
              onChange={(e) => patch({ default_auth_hours: Number(e.target.value) || 24 })}
            />
          </label>
          <label className="block space-y-1 sm:col-span-2">
            <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Default market
            </span>
            <select
              className={inputCls}
              value={form.default_pair ?? ""}
              onChange={(e) => patch({ default_pair: e.target.value || null })}
            >
              <option value="">No preference</option>
              {PAIRS.map((pair) => (
                <option key={pair.id} value={pair.id}>
                  {pair.id.replace("_", " / ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 accent-[var(--primary)]"
            checked={Boolean(form.confirm_before_order)}
            onChange={(e) => patch({ confirm_before_order: e.target.checked })}
          />
          <span>
            <span className="block text-sm text-foreground">Confirm before placing an order</span>
            <span className="block font-mono text-[11px] text-muted-foreground">
              Extra click before anything is signed on-chain.
            </span>
          </span>
        </label>
        <button
          onClick={() =>
            mutate.mutate({
              default_auth_cap: form.default_auth_cap ?? null,
              default_auth_hours: form.default_auth_hours ?? 24,
              default_pair: form.default_pair ?? null,
              confirm_before_order: Boolean(form.confirm_before_order),
            })
          }
          className="rounded-sm bg-primary px-4 py-2 font-mono text-xs font-semibold tracking-wider text-primary-foreground uppercase hover:opacity-90"
        >
          Save defaults
        </button>
      </Section>

      <Section title="Keys & access" desc="Your vault password and bot keys live behind their own screens.">
        <div className="flex flex-wrap gap-3">
          <Link
            to="/wallet"
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 font-mono text-xs uppercase hover:border-primary hover:text-primary"
          >
            <Wallet className="h-3.5 w-3.5" /> Vault, authorizations & password
          </Link>
          <Link
            to="/api-keys"
            className="inline-flex items-center gap-2 rounded-sm border border-border px-4 py-2 font-mono text-xs uppercase hover:border-primary hover:text-primary"
          >
            <KeyRound className="h-3.5 w-3.5" /> API keys
          </Link>
        </div>
        <p className="font-mono text-[11px] text-muted-foreground">
          Seeds cannot reset your vault password. It never leaves your browser — losing it means
          restoring from your recovery phrase.
        </p>
      </Section>
    </div>
  );
}
