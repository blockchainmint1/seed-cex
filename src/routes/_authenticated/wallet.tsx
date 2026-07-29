import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getMyWallet, markWalletBackedUp, saveMyWallet } from "@/lib/trading.functions";
import {
  listAuthorizations,
  grantAuthorization,
  revokeAuthorization,
  revokeAllAuthorizations,
} from "@/lib/delegation.functions";
import { CHAINS, EXPIRY_PRESETS, getChain, type ChainId } from "@/lib/chains";
import { getAddressStats } from "@/lib/txc.functions";
import { getEvmPortfolio } from "@/lib/evm.functions";
import {
  decryptMnemonic,
  deriveAddresses,
  deriveSharedKey,
  encryptMnemonic,
  isValidMnemonic,
  newMnemonic,
} from "@/lib/wallet/vault";
import { fmtAmount, truncateMiddle } from "@/lib/format";
import { ExplorerLink } from "@/components/site/ExplorerLink";

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
                <dd className="mt-1 break-all text-foreground">
                  <ExplorerLink chain="txc" address={wallet.data!.txc_address} />
                </dd>
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
                  <dd className="mt-1 break-all text-foreground">
                    <ExplorerLink chain="ethereum" address={wallet.data!.evm_address} />
                  </dd>
                  <p className="mt-1 flex gap-3 text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                    {(["base", "ethereum", "bsc"] as const).map((c) => (
                      <ExplorerLink key={c} chain={c} address={wallet.data!.evm_address!}>
                        {getChain(c).name}
                      </ExplorerLink>
                    ))}
                  </p>


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

      {hasWallet && wallet.data!.evm_address ? (
        <div className="mt-6">
          <EvmBalancesPanel address={wallet.data!.evm_address} />
        </div>
      ) : null}

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

function countdown(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  return `${h}h ${m}m left`;
}

function SharedAccessPanel({
  wallet,
}: {
  wallet: { vault_ciphertext: string; kdf_salt: string; kdf_iterations: number };
}) {
  const queryClient = useQueryClient();
  const fetchList = useServerFn(listAuthorizations);
  const grant = useServerFn(grantAuthorization);
  const revoke = useServerFn(revokeAuthorization);
  const revokeAll = useServerFn(revokeAllAuthorizations);

  const list = useQuery({
    queryKey: ["authorizations"],
    queryFn: () => fetchList(),
    refetchInterval: 60_000,
  });

  const [pw, setPw] = useState("");
  const [chainId, setChainId] = useState<ChainId>("txc");
  const [asset, setAsset] = useState("TXC");
  const [cap, setCap] = useState("500");
  const [hours, setHours] = useState("24");
  const [err, setErr] = useState<string | null>(null);

  const chain = getChain(chainId);

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
      const shared = deriveSharedKey(
        mnemonic,
        chain.sharedPath,
        chain.evmChainId === null ? "txc" : "evm",
      );
      return grant({
        data: {
          chain: chainId,
          asset,
          privateKeyHex: shared.privateKeyHex,
          address: shared.address,
          path: shared.path,
          maxAmount: Number(cap),
          hours: Number(hours),
        },
      });
    },
    onSuccess: () => {
      setPw("");
      setErr(null);
      queryClient.invalidateQueries({ queryKey: ["authorizations"] });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Could not authorize that branch"),
  });

  const disable = useMutation({
    mutationFn: (c: ChainId) => revoke({ data: { chain: c } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["authorizations"] }),
  });

  const killSwitch = useMutation({
    mutationFn: () => revokeAll(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["authorizations"] }),
  });

  const active = list.data ?? [];

  return (
    <Panel title="Trading authorizations" kicker="Non-custodial · capped · expiring">
      <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
        A centralised exchange makes you <em>deposit</em> — you hand over the coins and hold nothing
        when they close their doors. Seeds does the opposite: you keep the seed and authorize one
        branch of your own tree, account <span className="font-mono text-foreground">9&apos;</span>,
        for a capped amount and a fixed window. When the clock runs out the key is{" "}
        <Link to="/custody" className="text-primary underline-offset-4 hover:underline">
          permanently wiped
        </Link>
        , and anyone can audit how many keys we hold. Your savings branch{" "}
        <span className="font-mono text-foreground">0&apos;</span> is never authorized, and the seed
        itself never leaves this tab.
      </p>

      {err ? (
        <p className="mt-4 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
          {err}
        </p>
      ) : null}

      {active.length > 0 ? (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[640px] font-mono text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                <th className="py-2 pr-4 font-normal">Chain</th>
                <th className="py-2 pr-4 font-normal">Asset</th>
                <th className="py-2 pr-4 font-normal">Cap</th>
                <th className="py-2 pr-4 font-normal">Expires</th>
                <th className="py-2 pr-4 font-normal">Address</th>
                <th className="py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {active.map((a) => (
                <tr key={a.chain} className="border-b border-border/50">
                  <td className="py-2.5 pr-4 text-foreground">{getChain(a.chain).name}</td>
                  <td className="py-2.5 pr-4 text-foreground">{a.asset}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-foreground">
                    {fmtAmount(a.maxAmount, 2)}
                  </td>
                  <td className="py-2.5 pr-4 text-warn">{countdown(a.expiresAt)}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">
                    {truncateMiddle(a.address, 10, 8)}
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => disable.mutate(a.chain)}
                      disabled={disable.isPending}
                      className="text-destructive uppercase tracking-[0.14em] hover:underline disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={() => killSwitch.mutate()}
            disabled={killSwitch.isPending}
            className="mt-4 rounded-sm border border-destructive px-5 py-2.5 font-mono text-xs tracking-[0.16em] text-destructive uppercase disabled:opacity-50"
          >
            {killSwitch.isPending ? "Wiping…" : "Revoke everything now"}
          </button>
        </div>
      ) : (
        <p className="mt-5 font-mono text-xs text-muted-foreground">
          No live authorizations. Seeds holds nothing of yours.
        </p>
      )}

      <div className="mt-6 border-t border-border pt-5">
        <p className="font-mono text-[10px] tracking-[0.2em] text-primary uppercase">
          New authorization
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Vault password"
            maxLength={200}
            className="rounded-sm border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary sm:col-span-4"
          />
          <label className="font-mono text-[11px] text-muted-foreground">
            Chain
            <select
              value={chainId}
              onChange={(e) => {
                const next = e.target.value as ChainId;
                setChainId(next);
                setAsset(getChain(next).assets[0].symbol);
              }}
              className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-primary"
            >
              {CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="font-mono text-[11px] text-muted-foreground">
            Asset
            <select
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-primary"
            >
              {chain.assets.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol}
                </option>
              ))}
            </select>
          </label>
          <label className="font-mono text-[11px] text-muted-foreground">
            Spending cap ({asset})
            <input
              type="number"
              min={0}
              step="any"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="font-mono text-[11px] text-muted-foreground">
            Expires in
            <select
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-primary"
            >
              {EXPIRY_PRESETS.map((p) => (
                <option key={p.hours} value={String(p.hours)}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          onClick={() => enable.mutate()}
          disabled={enable.isPending || pw.length === 0}
          className="mt-4 rounded-sm bg-primary px-5 py-2.5 font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase disabled:opacity-50"
        >
          {enable.isPending ? "Authorizing…" : `Authorize on ${chain.name}`}
        </button>
        <p className="mt-3 font-mono text-[11px] text-muted-foreground">
          One live authorization per chain — authorizing again replaces the previous one.
        </p>
      </div>
    </Panel>
  );
}



/** Live balances for the same EVM address across Base, Ethereum, and BNB Chain. */
function EvmBalancesPanel({ address }: { address: string }) {
  const fetchPortfolio = useServerFn(getEvmPortfolio);
  const portfolio = useQuery({
    queryKey: ["evm-portfolio", address],
    queryFn: () => fetchPortfolio({ data: { address } }),
    refetchInterval: 120_000,
  });

  return (
    <Panel title="EVM balances" kicker="Base · Ethereum · BNB Chain">
      <p className="font-mono text-[11px] break-all text-muted-foreground">{address}</p>
      {portfolio.isPending ? (
        <p className="mt-4 font-mono text-xs text-muted-foreground">Reading chains…</p>
      ) : (
        <div className="mt-4 grid gap-x-8 gap-y-3 sm:grid-cols-3">
          {(portfolio.data ?? []).map((b) => (
            <div key={`${b.chain}-${b.symbol}`} className="font-mono">
              <p className="text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
                {b.chainName} · {b.symbol}
              </p>
              <p className="mt-1 text-sm tabular-nums text-foreground">
                {b.online ? fmtAmount(b.balance, 6) : "unavailable"}
              </p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
