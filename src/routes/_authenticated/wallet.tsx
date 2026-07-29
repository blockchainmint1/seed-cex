import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getMyWallet, markWalletBackedUp, saveMyWallet } from "@/lib/trading.functions";
import { getAddressStats } from "@/lib/txc.functions";
import {
  decryptMnemonic,
  deriveAddresses,
  encryptMnemonic,
  isValidMnemonic,
  newMnemonic,
} from "@/lib/wallet/vault";
import { fmtAmount, truncateMiddle } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet Vault — Seeds" },
      {
        name: "description",
        content:
          "Create or unlock your browser-encrypted Seeds wallet, view your TEXITcoin balance, and back up your recovery phrase.",
      },
      { property: "og:title", content: "Wallet Vault — Seeds" },
      {
        property: "og:description",
        content: "Browser-encrypted recovery phrase, TXC balance, and backup status.",
      },
    ],
  }),
  component: Wallet,
});

function Panel({
  title,
  kicker,
  children,
}: {
  title: string;
  kicker?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-sm border border-border bg-surface">
      <header className="border-b border-border px-5 py-3">
        {kicker ? (
          <p className="font-mono text-[10px] tracking-[0.2em] text-primary uppercase">{kicker}</p>
        ) : null}
        <h2 className="font-display text-sm font-bold tracking-[0.1em] text-foreground uppercase">
          {title}
        </h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Wallet() {
  const queryClient = useQueryClient();
  const fetchWallet = useServerFn(getMyWallet);
  const persistWallet = useServerFn(saveMyWallet);
  const confirmBackup = useServerFn(markWalletBackedUp);
  const fetchStats = useServerFn(getAddressStats);

  const wallet = useQuery({ queryKey: ["my-wallet"], queryFn: () => fetchWallet() });

  const balance = useQuery({
    queryKey: ["txc-balance", wallet.data?.txc_address],
    queryFn: () => fetchStats({ data: { address: wallet.data!.txc_address } }),
    enabled: Boolean(wallet.data?.txc_address),
    refetchInterval: 90_000,
  });

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [importPhrase, setImportPhrase] = useState("");
  const [tab, setTab] = useState<"create" | "import">("create");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      if (password.length < 10) throw new Error("Use at least 10 characters for the vault password");
      if (password !== confirm) throw new Error("Passwords do not match");

      const mnemonic = tab === "import" ? importPhrase.trim().replace(/\s+/g, " ") : newMnemonic();
      if (tab === "import" && !isValidMnemonic(mnemonic)) {
        throw new Error("That is not a valid BIP-39 recovery phrase");
      }

      const { txcAddress, evmAddress } = deriveAddresses(mnemonic);
      const vault = await encryptMnemonic(mnemonic, password);

      await persistWallet({
        data: {
          vaultCiphertext: vault.ciphertext,
          kdfSalt: vault.salt,
          kdfIterations: vault.iterations,
          txcAddress,
          evmAddress,
        },
      });
      return mnemonic;
    },
    onSuccess: (mnemonic) => {
      setRevealed(mnemonic);
      setPassword("");
      setConfirm("");
      setImportPhrase("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["my-wallet"] });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Could not create the vault"),
  });

  const unlock = useMutation({
    mutationFn: async () => {
      const w = wallet.data;
      if (!w) throw new Error("No vault found");
      return decryptMnemonic(
        { ciphertext: w.vault_ciphertext, salt: w.kdf_salt, iterations: w.kdf_iterations },
        unlockPassword,
      );
    },
    onSuccess: (mnemonic) => {
      setRevealed(mnemonic);
      setUnlockPassword("");
      setError(null);
    },
    onError: () => setError("Wrong password — the vault could not be decrypted"),
  });

  const backedUp = useMutation({
    mutationFn: () => confirmBackup(),
    onSuccess: () => {
      setRevealed(null);
      queryClient.invalidateQueries({ queryKey: ["my-wallet"] });
    },
  });

  const hasWallet = Boolean(wallet.data);

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">Vault</p>
      <h1 className="mt-3 font-display text-3xl font-black tracking-tight text-foreground uppercase">
        Your wallet
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Everything below happens in this browser tab. Seeds receives only the encrypted blob and
        your public addresses — never the phrase, never the password.
      </p>

      {error ? (
        <p className="mt-6 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {revealed ? (
        <div className="mt-8 rounded-sm border border-warn/50 bg-warn/5 p-6">
          <p className="font-mono text-[11px] tracking-[0.2em] text-warn uppercase">
            Write this down offline — it will not be shown again
          </p>
          <ol className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
            {revealed.split(" ").map((word, i) => (
              <li
                key={`${word}-${i}`}
                className="rounded-sm border border-border bg-background px-3 py-2 font-mono text-sm"
              >
                <span className="mr-2 text-muted-foreground tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {word}
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => backedUp.mutate()}
              className="rounded-sm bg-primary px-5 py-2.5 font-mono text-xs tracking-[0.16em] text-primary-foreground uppercase"
            >
              I wrote it down
            </button>
            <button
              onClick={() => setRevealed(null)}
              className="rounded-sm border border-border px-5 py-2.5 font-mono text-xs tracking-[0.16em] text-foreground uppercase"
            >
              Hide
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {!hasWallet ? (
          <Panel title={tab === "create" ? "Generate a vault" : "Import a phrase"} kicker="Step 1">
            <div className="mb-5 flex gap-2">
              {(["create", "import"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`rounded-sm border px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] uppercase ${
                    tab === t
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {t === "create" ? "New phrase" : "Import"}
                </button>
              ))}
            </div>

            {tab === "import" ? (
              <textarea
                value={importPhrase}
                onChange={(e) => setImportPhrase(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="twelve words separated by spaces"
                className="mb-4 w-full rounded-sm border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
              />
            ) : null}

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Vault password (10+ characters)"
              maxLength={200}
              className="mb-3 w-full rounded-sm border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm vault password"
              maxLength={200}
              className="mb-4 w-full rounded-sm border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => create.mutate()}
              disabled={create.isPending}
              className="w-full rounded-sm bg-primary px-4 py-3 font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase disabled:opacity-50"
            >
              {create.isPending ? "Encrypting…" : "Create encrypted vault"}
            </button>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              600,000 PBKDF2 rounds · AES-256-GCM · nothing readable leaves this tab.
            </p>
          </Panel>
        ) : (
          <Panel title="Unlock" kicker="Local decryption">
            <input
              type="password"
              value={unlockPassword}
              onChange={(e) => setUnlockPassword(e.target.value)}
              placeholder="Vault password"
              maxLength={200}
              className="mb-4 w-full rounded-sm border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => unlock.mutate()}
              disabled={unlock.isPending}
              className="w-full rounded-sm border border-primary px-4 py-3 font-mono text-xs tracking-[0.16em] text-primary uppercase disabled:opacity-50"
            >
              {unlock.isPending ? "Decrypting…" : "Reveal recovery phrase"}
            </button>
            <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
              Decryption runs locally. A wrong password simply fails — there is no reset.
            </p>
          </Panel>
        )}

        <Panel title="Balances" kicker="TEXITcoin mainnet">
          {!hasWallet ? (
            <p className="font-mono text-xs text-muted-foreground">
              Create a vault to get a receive address.
            </p>
          ) : (
            <dl className="space-y-4 font-mono text-sm">
              <div>
                <dt className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                  TXC address
                </dt>
                <dd className="mt-1 break-all text-foreground">{wallet.data!.txc_address}</dd>
              </div>
              <div className="flex gap-8">
                <div>
                  <dt className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                    Confirmed
                  </dt>
                  <dd className="mt-1 text-xl text-foreground tabular-nums">
                    {balance.data ? fmtAmount(balance.data.confirmed, 8) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                    Pending
                  </dt>
                  <dd className="mt-1 text-xl text-foreground tabular-nums">
                    {balance.data ? fmtAmount(balance.data.unconfirmed, 8) : "—"}
                  </dd>
                </div>
              </div>
              {wallet.data!.evm_address ? (
                <div>
                  <dt className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                    USDC (EVM) address
                  </dt>
                  <dd className="mt-1 text-foreground">
                    {truncateMiddle(wallet.data!.evm_address, 12, 10)}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                  Backup status
                </dt>
                <dd className={wallet.data!.backed_up ? "mt-1 text-bid" : "mt-1 text-warn"}>
                  {wallet.data!.backed_up ? "Confirmed backed up" : "Not confirmed — reveal and write it down"}
                </dd>
              </div>
            </dl>
          )}
        </Panel>
      </div>

      {hasWallet ? (
        <div className="mt-6">
          <SharedAccessPanel wallet={wallet.data!} />
        </div>
      ) : null}

      <div className="mt-8">
        <Link
          to="/trade/usdc-txc"
          className="inline-block rounded-sm border border-border px-5 py-2.5 font-mono text-xs tracking-[0.16em] text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
        >
          Go to the USDC/TXC book
        </Link>
      </div>
    </div>
  );
}

function SharedAccessPanel({
  wallet,
}: {
  wallet: { vault_ciphertext: string; kdf_salt: string; kdf_iterations: number };
}) {
  const queryClient = useQueryClient();
  const fetchStatus = useServerFn(getSharedAccess);
  const grant = useServerFn(grantSharedAccess);
  const revoke = useServerFn(revokeSharedAccess);

  const status = useQuery({ queryKey: ["shared-access"], queryFn: () => fetchStatus() });

  const [pw, setPw] = useState("");
  const [cap, setCap] = useState("500");
  const [days, setDays] = useState("30");
  const [err, setErr] = useState<string | null>(null);

  const enable = useMutation({
    mutationFn: async () => {
      const mnemonic = await decryptMnemonic(
        {
          ciphertext: wallet.vault_ciphertext,
          salt: wallet.kdf_salt,
          iterations: wallet.kdf_iterations,
        },
        pw,
      );
      const shared = deriveSharedTradingKey(mnemonic);
      return grant({
        data: {
          privateKeyHex: shared.privateKeyHex,
          tradingAddress: shared.txcAddress,
          tradingPath: shared.path,
          maxAmount: Number(cap),
          days: Number(days),
        },
      });
    },
    onSuccess: () => {
      setPw("");
      setErr(null);
      queryClient.invalidateQueries({ queryKey: ["shared-access"] });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Could not enable shared access"),
  });

  const disable = useMutation({
    mutationFn: () => revoke(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shared-access"] }),
  });

  const s = status.data;

  return (
    <Panel title="Shared trading account" kicker="Optional · co-signed settlement">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        A centralised exchange makes you <em>deposit</em> — you hand over the coins and hold nothing.
        Seeds does the opposite: you keep the seed, and you may lend Seeds a copy of{" "}
        <span className="font-mono text-foreground">m/44&apos;/0&apos;/9&apos;</span> — one branch of
        your own tree, used only for settling trades. You hold the identical key, you can sweep the
        branch at any second, and revoking is one click. Your savings branch{" "}
        <span className="font-mono text-foreground">m/44&apos;/0&apos;/0&apos;</span> is never
        shared, and the seed itself never leaves this tab.
      </p>

      {err ? (
        <p className="mt-4 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {err}
        </p>
      ) : null}

      {s?.active ? (
        <div className="mt-5 space-y-4 font-mono text-sm">
          <div className="flex flex-wrap gap-8">
            <div>
              <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Status</p>
              <p className="mt-1 text-bid">Shared · instant settlement on</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">Cap</p>
              <p className="mt-1 text-foreground tabular-nums">{fmtAmount(s.maxAmount, 2)} TXC</p>
            </div>
            <div>
              <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                Expires
              </p>
              <p className="mt-1 text-foreground">
                {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : "—"}
              </p>
            </div>
          </div>
          <div>
            <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              Shared branch address
            </p>
            <p className="mt-1 break-all text-foreground">{s.tradingAddress}</p>
          </div>
          <button
            onClick={() => disable.mutate()}
            disabled={disable.isPending}
            className="rounded-sm border border-destructive px-5 py-2.5 font-mono text-xs tracking-[0.16em] text-destructive uppercase disabled:opacity-50"
          >
            {disable.isPending ? "Revoking…" : "Revoke shared access"}
          </button>
        </div>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Vault password"
            maxLength={200}
            className="rounded-sm border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary sm:col-span-3"
          />
          <label className="font-mono text-[11px] text-muted-foreground">
            Spending cap (TXC)
            <input
              type="number"
              min={1}
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="font-mono text-[11px] text-muted-foreground">
            Expires in (days)
            <input
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <button
            onClick={() => enable.mutate()}
            disabled={enable.isPending || pw.length === 0}
            className="self-end rounded-sm bg-primary px-4 py-2.5 font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase disabled:opacity-50"
          >
            {enable.isPending ? "Sharing…" : "Share trading branch"}
          </button>
        </div>
      )}
    </Panel>
  );
}

