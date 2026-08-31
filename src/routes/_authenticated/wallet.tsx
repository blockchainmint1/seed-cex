import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  getMyWallet,
  markWalletBackedUp,
  saveMyWallet,
  updateMyWalletAddresses,
} from "@/lib/trading.functions";
import {
  listAuthorizations,
  grantAuthorization,
  revokeAuthorization,
  revokeAllAuthorizations,
} from "@/lib/delegation.functions";
import { CHAINS, EXPIRY_PRESETS, PAIRS, getChain, type ChainId, type LegId } from "@/lib/chains";
import { getAddressStats } from "@/lib/txc.functions";
import { getUtxoBalances } from "@/lib/utxo.functions";
import { getEvmPortfolio } from "@/lib/evm.functions";
import { getTsdBalance, getWrappedBalances } from "@/lib/omni.functions";
import { openWrapOrder } from "@/lib/wrap.functions";
import { getWrapAsset } from "@/lib/wrap-config";
import { listMyWithdrawals } from "@/lib/withdrawal.functions";
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
import { WrapDesk } from "@/components/wallet/WrapDesk";


export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { title: "Spot Balances — Seeds" },
      {
        name: "description",
        content:
          "Your Seeds spot wallet: live balances across every chain, deposit addresses, withdrawals, and capped trading authorizations.",
      },
      { property: "og:title", content: "Spot Balances — Seeds" },
      {
        property: "og:description",
        content: "Balances, deposits, and withdrawals — non-custodial, straight from your own keys.",
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
  const backfillAddresses = useServerFn(updateMyWalletAddresses);

  const wallet = useQuery({ queryKey: ["my-wallet"], queryFn: () => fetchWallet() });

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [importPhrase, setImportPhrase] = useState("");
  const [tab, setTab] = useState<"create" | "import">("create");
  const [revealed, setRevealed] = useState<string | null>(null);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);


  const create = useMutation({
    mutationFn: async () => {
      if (password.length < 10) throw new Error("Use at least 10 characters for the vault password");
      if (password !== confirm) throw new Error("Passwords do not match");

      const mnemonic = tab === "import" ? importPhrase.trim().replace(/\s+/g, " ") : newMnemonic();
      if (tab === "import" && !isValidMnemonic(mnemonic)) {
        throw new Error("That is not a valid BIP-39 recovery phrase");
      }

      const { txcAddress, evmAddress, ltcAddress, iskAddress } = deriveAddresses(mnemonic);
      const vault = await encryptMnemonic(mnemonic, password);

      await persistWallet({
        data: {
          vaultCiphertext: vault.ciphertext,
          kdfSalt: vault.salt,
          kdfIterations: vault.iterations,
          txcAddress,
          evmAddress,
          ltcAddress,
          iskAddress,
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
      const mnemonic = await decryptMnemonic(
        { ciphertext: w.vault_ciphertext, salt: w.kdf_salt, iterations: w.kdf_iterations },
        unlockPassword,
      );
      // Older vaults predate the LTC/ISK branches — derive and backfill now.
      if (!w.ltc_address || !w.isk_address || !w.evm_address) {
        const derived = deriveAddresses(mnemonic);
        await backfillAddresses({
          data: {
            evmAddress: w.evm_address ? undefined : derived.evmAddress,
            ltcAddress: w.ltc_address ? undefined : derived.ltcAddress,
            iskAddress: w.isk_address ? undefined : derived.iskAddress,
          },
        });
        queryClient.invalidateQueries({ queryKey: ["my-wallet"] });
      }
      return mnemonic;
    },
    onSuccess: (mnemonic) => {
      setRevealed(mnemonic);
      setUnlockPassword("");
      setError(null);
    },
    onError: () => setError("Wrong password — the vault could not be decrypted"),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      const w = wallet.data;
      if (!w) throw new Error("No vault found");
      if (!unlockPassword) throw new Error("Enter your current vault password above");
      if (newPassword.length < 10) throw new Error("Use at least 10 characters for the new password");
      if (newPassword !== newPasswordConfirm) throw new Error("New passwords do not match");

      const mnemonic = await decryptMnemonic(
        { ciphertext: w.vault_ciphertext, salt: w.kdf_salt, iterations: w.kdf_iterations },
        unlockPassword,
      ).catch(() => {
        throw new Error("Current password is wrong — the vault could not be decrypted");
      });

      const { txcAddress, evmAddress, ltcAddress, iskAddress } = deriveAddresses(mnemonic);
      const vault = await encryptMnemonic(mnemonic, newPassword);
      await persistWallet({
        data: {
          vaultCiphertext: vault.ciphertext,
          kdfSalt: vault.salt,
          kdfIterations: vault.iterations,
          txcAddress,
          evmAddress,
          ltcAddress,
          iskAddress,
        },
      });
    },
    onSuccess: () => {
      setUnlockPassword("");
      setNewPassword("");
      setNewPasswordConfirm("");
      setError(null);
      setPasswordNotice("Vault re-encrypted with your new password.");
      queryClient.invalidateQueries({ queryKey: ["my-wallet"] });
    },
    onError: (e) => {
      setPasswordNotice(null);
      setError(e instanceof Error ? e.message : "Could not change the vault password");
    },
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
    <div className="mx-auto max-w-7xl px-5 py-12">
      <p className="font-mono text-[11px] tracking-[0.24em] text-primary uppercase">Wallet</p>
      <h1 className="mt-3 font-display text-3xl font-black tracking-tight text-foreground uppercase">
        Spot balances
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Your coins live at your own addresses — Seeds never takes a deposit. Vault encryption and
        decryption happen in this browser tab; the server only ever sees the encrypted blob and
        your public addresses.
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

      {!hasWallet ? (
        <div className="mt-8 max-w-xl">
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
        </div>
      ) : (
        <>
          <div className="mt-8">
            <SharedAccessPanel wallet={wallet.data!} />
          </div>

          <div className="mt-6">
            <SpotBalances wallet={wallet.data!} />
          </div>

          <div className="mt-6">
            <WrapDesk />
          </div>


          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Panel title="Unlock vault" kicker="Local decryption">
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
                Decryption runs locally. Backup status:{" "}
                <span className={wallet.data!.backed_up ? "text-bid" : "text-warn"}>
                  {wallet.data!.backed_up ? "confirmed" : "not confirmed"}
                </span>
                .
              </p>

              <div className="mt-6 border-t border-border pt-5">
                <p className="mb-3 font-mono text-[10px] tracking-[0.2em] text-primary uppercase">
                  Change vault password
                </p>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (10+ characters)"
                  maxLength={200}
                  className="mb-3 w-full rounded-sm border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
                />
                <input
                  type="password"
                  value={newPasswordConfirm}
                  onChange={(e) => setNewPasswordConfirm(e.target.value)}
                  placeholder="Confirm new password"
                  maxLength={200}
                  className="mb-3 w-full rounded-sm border border-input bg-background px-3 py-2.5 font-mono text-sm outline-none focus:border-primary"
                />
                <button
                  onClick={() => changePassword.mutate()}
                  disabled={changePassword.isPending}
                  className="w-full rounded-sm border border-border px-4 py-2.5 font-mono text-xs tracking-[0.16em] text-foreground uppercase disabled:opacity-50"
                >
                  {changePassword.isPending ? "Re-encrypting…" : "Re-encrypt vault"}
                </button>
                <p className="mt-3 font-mono text-[11px] leading-relaxed text-muted-foreground">
                  Enter your current password above, then the new one here. The phrase is decrypted
                  and re-encrypted in this tab — your addresses and funds are unchanged.
                </p>
                {passwordNotice ? (
                  <p className="mt-3 font-mono text-[11px] text-bid">{passwordNotice}</p>
                ) : null}
              </div>
            </Panel>

            <WithdrawalHistory />
          </div>
        </>
      )}

    </div>
  );
}

/* ------------------------------ spot balances ----------------------------- */

type SpotRow = {
  key: string;
  symbol: string;
  name: string;
  chain: ChainId;
  chainName: string;
  balance: number | null;
  pending?: number | null;
  online: boolean;
  address: string | null;
  leg: LegId | null;
  tradeSlug: string | null;
  /** Balance sitting in the authorized trading branch ("locked" for trading). */
  locked?: number | null;
  /** Deposit goes through the wrap desk instead of a plain address. */
  wrapBase?: string;
  /** Per-network breakdown for assets consolidated across EVM chains. */
  parts?: { chainName: string; balance: number | null }[];
};

function tradeSlugFor(symbol: string): string | null {
  const pair = PAIRS.find((p) => p.base === symbol || p.quote === symbol);
  return pair ? pair.slug : null;
}

function SpotBalances({
  wallet,
}: {
  wallet: {
    txc_address: string;
    evm_address: string | null;
    ltc_address: string | null;
    isk_address: string | null;
  };
}) {
  const fetchStats = useServerFn(getAddressStats);
  const fetchTsd = useServerFn(getTsdBalance);
  const fetchUtxo = useServerFn(getUtxoBalances);
  const fetchPortfolio = useServerFn(getEvmPortfolio);
  const fetchAuths = useServerFn(listAuthorizations);

  const txc = useQuery({
    queryKey: ["txc-balance", wallet.txc_address],
    queryFn: () => fetchStats({ data: { address: wallet.txc_address } }),
    refetchInterval: 90_000,
  });
  const tsd = useQuery({
    queryKey: ["tsd-balance", wallet.txc_address],
    queryFn: () => fetchTsd({ data: { address: wallet.txc_address } }),
    refetchInterval: 90_000,
  });
  const fetchWrapped = useServerFn(getWrappedBalances);
  const wrapped = useQuery({
    queryKey: ["wrapped-balances", wallet.txc_address],
    queryFn: () => fetchWrapped({ data: { address: wallet.txc_address } }),
    refetchInterval: 90_000,
  });
  const utxo = useQuery({
    queryKey: ["utxo-balances", wallet.ltc_address, wallet.isk_address],
    queryFn: () => fetchUtxo({ data: { ltcAddress: wallet.ltc_address, iskAddress: wallet.isk_address } }),
    refetchInterval: 120_000,
  });
  const evm = useQuery({
    queryKey: ["evm-portfolio", wallet.evm_address],
    queryFn: () => fetchPortfolio({ data: { address: wallet.evm_address! } }),
    enabled: Boolean(wallet.evm_address),
    refetchInterval: 120_000,
  });
  const auths = useQuery({
    queryKey: ["authorizations"],
    queryFn: () => fetchAuths(),
    refetchInterval: 60_000,
  });

  const authorizedAssets = useMemo(
    () => new Set((auths.data ?? []).map((a) => a.asset)),
    [auths.data],
  );

  const rows: SpotRow[] = useMemo(() => {
    const out: SpotRow[] = [];
    out.push({
      key: "txc",
      symbol: "TXC",
      name: "TEXITcoin",
      chain: "txc",
      chainName: "TEXITcoin",
      balance: txc.data ? txc.data.confirmed : null,
      pending: txc.data ? txc.data.unconfirmed : null,
      online: Boolean(txc.data),
      address: wallet.txc_address,
      leg: "txc",
      tradeSlug: tradeSlugFor("TXC"),
    });
    out.push({
      key: "tsd",
      symbol: "TSD",
      name: "Texas Stable Dollar",
      chain: "txc",
      chainName: "TEXITcoin · Omni #39",
      balance: tsd.data ? tsd.data.balance : null,
      online: Boolean(tsd.data?.online),
      address: wallet.txc_address,
      leg: "tsd",
      tradeSlug: tradeSlugFor("TSD"),
    });
    // BTC lists as a first-class asset. There's no native BTC branch in the
    // vault — deposits are wrapped 1:1 into wBTC (Omni #43) by the issuer,
    // so the balance shown is the wBTC sitting at the TEXITcoin address.
    const wbtc = (wrapped.data ?? []).find((w) => w.symbol === "wBTC");
    out.push({
      key: "btc",
      symbol: "BTC",
      name: "Bitcoin",
      chain: "txc",
      chainName: "Bitcoin · settles as wBTC on TEXITcoin",
      balance: wbtc ? wbtc.balance : null,
      online: Boolean(wbtc?.online),
      address: null,
      leg: null,
      tradeSlug: "btc-tsd",
      wrapBase: "BTC",
    });
    const utxoChains: { chain: "ltc" | "isk"; symbol: string; address: string | null }[] = [
      { chain: "ltc", symbol: "LTC", address: wallet.ltc_address },
      { chain: "isk", symbol: "ISK", address: wallet.isk_address },
    ];
    for (const c of utxoChains) {
      const b = (utxo.data ?? []).find((x) => x.chain === c.chain);
      out.push({
        key: c.chain,
        symbol: c.symbol,
        name: getChain(c.chain).name,
        chain: c.chain as ChainId,
        chainName: getChain(c.chain).name,
        balance: b?.online ? b.balance : null,
        online: Boolean(b?.online),
        address: c.address,
        leg: c.chain as LegId,
        tradeSlug: tradeSlugFor(c.symbol),
      });
    }

    // Consolidate EVM assets: one row per symbol across Ethereum, Base and
    // BNB Chain — same address everywhere, so the per-chain split is detail.
    const bySymbol = new Map<string, typeof evm.data>();
    for (const b of evm.data ?? []) {
      const list = bySymbol.get(b.symbol) ?? [];
      list.push(b);
      bySymbol.set(b.symbol, list as typeof evm.data);
    }
    for (const [symbol, entries] of bySymbol) {
      const list = entries ?? [];
      const leg =
        symbol === "USDC" ? "usdc" : symbol === "USDT" ? "usdt" : symbol === "ZCU" ? "zcu" : null;
      const online = list.some((b) => b.online);
      const total = list.reduce((sum, b) => sum + (b.online ? b.balance : 0), 0);
      const single = list.length === 1;
      out.push({
        key: `evm-${symbol}`,
        symbol,
        name: single ? (list[0]?.chainName ?? "EVM") : "EVM networks",
        chain: (list[0]?.chain ?? "base") as ChainId,
        chainName: single ? (list[0]?.chainName ?? "EVM") : "EVM",
        balance: online ? total : null,
        online,
        address: wallet.evm_address,
        leg,
        tradeSlug: tradeSlugFor(symbol),
        parts: single
          ? undefined
          : list.map((b) => ({ chainName: b.chainName, balance: b.online ? b.balance : null })),
      });
    }
    return out;
  }, [txc.data, tsd.data, wrapped.data, utxo.data, evm.data, wallet]);

  const [depositRow, setDepositRow] = useState<SpotRow | null>(null);
  const [withdrawRow, setWithdrawRow] = useState<SpotRow | null>(null);
  const [wrapDepositRow, setWrapDepositRow] = useState<SpotRow | null>(null);

  const loading = txc.isPending && utxo.isPending && evm.isPending;

  return (
    <section className="rounded-sm border border-border bg-surface">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-primary uppercase">
            Spot account
          </p>
          <h2 className="font-display text-sm font-bold tracking-[0.1em] text-foreground uppercase">
            Balances
          </h2>
        </div>
        <p className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
          Non-custodial · your keys
        </p>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] font-mono text-xs">
          <thead>
            <tr className="border-b border-border text-left text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
              <th className="px-5 py-2.5 font-normal">Asset</th>
              <th className="py-2.5 pr-4 font-normal">Network</th>
              <th className="py-2.5 pr-4 font-normal text-right">Available</th>
              <th className="py-2.5 pr-4 font-normal text-right">Deposit</th>
              <th className="py-2.5 pr-4 font-normal text-right">Withdraw</th>
              <th className="px-5 py-2.5 font-normal text-right">Trade</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border/50 last:border-0">
                <td className="px-5 py-3">
                  <p className="font-semibold text-foreground">{r.symbol}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{r.name}</p>
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {r.chainName}
                  {r.parts ? (
                    <span className="mt-0.5 block text-[10px] text-muted-foreground/70">
                      {r.parts.map((p) => p.chainName).join(" · ")}
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-4 text-right tabular-nums text-foreground">
                  {r.balance === null ? (
                    <span className="text-muted-foreground">{r.online ? "…" : "unavailable"}</span>
                  ) : (
                    <>
                      {fmtAmount(r.balance, r.balance >= 1000 ? 2 : 6)}
                      {r.pending !== null && r.pending !== undefined && r.pending !== 0 ? (
                        <span className="block text-[10px] text-warn">
                          +{fmtAmount(r.pending, 8)} pending
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
                <td className="py-3 pr-4 text-right">
                  <button
                    onClick={() => (r.wrapBase ? setWrapDepositRow(r) : setDepositRow(r))}
                    className="rounded-sm border border-border px-3 py-1.5 text-[10px] tracking-[0.14em] text-foreground uppercase transition-colors hover:border-primary hover:text-primary"
                  >
                    Deposit
                  </button>
                </td>
                <td className="py-3 pr-4 text-right">
                  {r.leg ? (
                    <button
                      onClick={() => setWithdrawRow(r)}
                      className={`rounded-sm border px-3 py-1.5 text-[10px] tracking-[0.14em] uppercase transition-colors ${
                        authorizedAssets.has(r.symbol)
                          ? "border-border text-foreground hover:border-primary hover:text-primary"
                          : "border-border/50 text-muted-foreground"
                      }`}
                    >
                      Withdraw
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">gas only</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {r.tradeSlug ? (
                    <Link
                      to={`/trade/${r.tradeSlug}` as string}
                      className="text-[10px] tracking-[0.14em] text-primary uppercase hover:underline"
                    >
                      Trade →
                    </Link>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loading ? (
        <p className="border-t border-border px-5 py-3 font-mono text-[10px] text-muted-foreground">
          Reading chains…
        </p>
      ) : null}

      {depositRow ? <DepositModal row={depositRow} onClose={() => setDepositRow(null)} /> : null}
      {withdrawRow ? (
        <WithdrawModal
          row={withdrawRow}
          authorized={authorizedAssets.has(withdrawRow.symbol)}
          onClose={() => setWithdrawRow(null)}
        />
      ) : null}
    </section>
  );
}

/* --------------------------------- deposit -------------------------------- */

function DepositModal({ row, onClose }: { row: SpotRow; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const address = row.address ?? "";
  return (
    <Modal onClose={onClose} title={`Deposit ${row.symbol}`}>
      <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
        Send only <span className="text-foreground">{row.symbol}</span> on{" "}
        <span className="text-foreground">{row.chainName}</span> to this address. It is yours —
        derived from your own seed.
      </p>
      {address ? (
        <div className="mt-5 flex justify-center">
          <div className="rounded-xl bg-[#f2f8ef] p-3.5 shadow-[inset_0_0_0_1px_oklch(0.87_0.03_150),0_10px_28px_-14px_oklch(0.2_0.05_150/55%)]">
            <QRCodeSVG
              value={address}
              size={164}
              bgColor="transparent"
              fgColor="#17301d"
              level="M"
              includeMargin={false}
            />
          </div>
        </div>
      ) : null}
      <div className="mt-4 rounded-sm border border-border bg-background p-4">
        <p className="break-all font-mono text-sm text-foreground">
          {address || "Unlock your vault below once — this derives and saves your address."}
        </p>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => {
            void navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="flex-1 rounded-sm bg-primary px-4 py-2.5 font-mono text-xs tracking-[0.16em] text-primary-foreground uppercase"
        >
          {copied ? "Copied" : "Copy address"}
        </button>
        <ExplorerLink chain={row.chain} address={address}>
          <span className="block rounded-sm border border-border px-4 py-2.5 font-mono text-xs tracking-[0.16em] text-foreground uppercase">
            Explorer
          </span>
        </ExplorerLink>
      </div>
      <p className="mt-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
        No deposit to Seeds is ever needed — funds land in your wallet directly. To let the
        exchange settle trades, authorize the branch below with a cap and an expiry.
      </p>
    </Modal>
  );
}

/* -------------------------------- withdraw -------------------------------- */

function WithdrawModal({
  row,
  authorized,
  onClose,
}: {
  row: SpotRow;
  authorized: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const preview = useServerFn(previewWithdrawalFn);
  const withdraw = useServerFn(requestWithdrawal);

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [result, setResult] = useState<{ txid: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const leg = row.leg as LegId;
  const parsedAmount = Number(amount);

  const dryRun = useMutation({
    mutationFn: () =>
      preview({ data: { leg, to: to.trim(), amount: parsedAmount } }),
    onError: (e) => setErr(e instanceof Error ? e.message : "Preview failed"),
  });

  const send = useMutation({
    mutationFn: () => withdraw({ data: { leg, to: to.trim(), amount: parsedAmount } }),
    onSuccess: (r) => {
      setResult({ txid: r.txid });
      setErr(null);
      queryClient.invalidateQueries({ queryKey: ["my-withdrawals"] });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Withdrawal failed"),
  });

  return (
    <Modal onClose={onClose} title={`Withdraw ${row.symbol}`}>
      {!authorized ? (
        <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
          Withdrawals are signed by your authorized trading branch — Seeds never holds your savings
          key. Scroll down to <span className="text-foreground">Trading authorizations</span> and
          authorize <span className="text-foreground">{row.symbol}</span> with a cap and expiry
          first, then come back.
        </p>
      ) : result ? (
        <div>
          <p className="font-mono text-xs text-bid uppercase tracking-[0.14em]">Broadcast</p>
          <p className="mt-2 break-all font-mono text-sm text-foreground">{result.txid}</p>
          <a
            href={`${getChain(row.chain).explorer.replace("/address/", "/tx/")}${result.txid}`}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-sm border border-border px-4 py-2.5 font-mono text-xs tracking-[0.16em] text-foreground uppercase hover:border-primary hover:text-primary"
          >
            View on explorer
          </a>
        </div>
      ) : (
        <div>
          <p className="font-mono text-[11px] leading-relaxed text-muted-foreground">
            Sends from your capped trading branch on{" "}
            <span className="text-foreground">{row.chainName}</span>. Available there is limited by
            your authorization cap — the server checks cap, expiry, and balance before signing.
          </p>
          <label className="mt-4 block font-mono text-[11px] text-muted-foreground">
            Destination address
            <input
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder={`${row.symbol} address on ${row.chainName}`}
              maxLength={120}
              className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary"
            />
          </label>
          <label className="mt-3 block font-mono text-[11px] text-muted-foreground">
            Amount ({row.symbol})
            <input
              type="number"
              min={0}
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-sm border border-input bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-primary"
            />
          </label>

          {dryRun.data ? (
            <p
              className={`mt-3 rounded-sm border px-3 py-2 font-mono text-[11px] ${
                dryRun.data.ready
                  ? "border-bid/40 bg-bid/10 text-bid"
                  : "border-warn/40 bg-warn/10 text-warn"
              }`}
            >
              {dryRun.data.ready
                ? `Ready — branch holds ${fmtAmount(dryRun.data.balance ?? 0, 6)} ${row.symbol} on ${dryRun.data.chainName}`
                : dryRun.data.reason}
            </p>
          ) : null}
          {err ? (
            <p className="mt-3 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 font-mono text-[11px] text-destructive">
              {err}
            </p>
          ) : null}

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => dryRun.mutate()}
              disabled={dryRun.isPending || !to.trim() || !(parsedAmount > 0)}
              className="flex-1 rounded-sm border border-border px-4 py-2.5 font-mono text-xs tracking-[0.16em] text-foreground uppercase disabled:opacity-50"
            >
              {dryRun.isPending ? "Checking…" : "Dry run"}
            </button>
            <button
              onClick={() => send.mutate()}
              disabled={send.isPending || !(dryRun.data?.ready)}
              className="flex-1 rounded-sm bg-primary px-4 py-2.5 font-mono text-xs font-semibold tracking-[0.16em] text-primary-foreground uppercase disabled:opacity-50"
            >
              {send.isPending ? "Broadcasting…" : "Send on-chain"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-sm border border-border bg-surface p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-bold tracking-[0.1em] text-foreground uppercase">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="font-mono text-xs text-muted-foreground uppercase hover:text-foreground"
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

/* ---------------------------- withdrawal history --------------------------- */

function WithdrawalHistory() {
  const fetchWithdrawals = useServerFn(listMyWithdrawals);
  const list = useQuery({
    queryKey: ["my-withdrawals"],
    queryFn: () => fetchWithdrawals(),
    refetchInterval: 60_000,
  });

  return (
    <Panel title="Withdrawals" kicker="Recent">
      {(list.data ?? []).length === 0 ? (
        <p className="font-mono text-xs text-muted-foreground">No withdrawals yet.</p>
      ) : (
        <ul className="space-y-3 font-mono text-xs">
          {(list.data ?? []).map((w) => (
            <li key={w.id} className="border-b border-border/50 pb-3 last:border-0 last:pb-0">
              <p className="text-foreground tabular-nums">
                {fmtAmount(w.amount, 6)} {w.asset}{" "}
                <span className="text-muted-foreground">on {getChain(w.chain).name}</span>
              </p>
              <p className="mt-1 text-muted-foreground">
                to {truncateMiddle(w.to_address, 10, 8)} ·{" "}
                <a
                  href={`${getChain(w.chain).explorer.replace("/address/", "/tx/")}${w.txid}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {truncateMiddle(w.txid, 8, 6)}
                </a>
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
                {new Date(w.created_at).toLocaleString()} · {w.status}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* --------------------------- trading authorizations ------------------------ */

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
        chain.evmChainId === null ? (chain.p2pkhVersion ?? 66) : "evm",
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
    mutationFn: (v: { chain: ChainId; asset: string }) =>
      revoke({ data: { chain: v.chain, asset: v.asset } }),
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
                <tr key={`${a.chain}-${a.asset}`} className="border-b border-border/50">
                  <td className="py-2.5 pr-4 text-foreground">{getChain(a.chain).name}</td>
                  <td className="py-2.5 pr-4 text-foreground">{a.asset}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-foreground">
                    {fmtAmount(a.maxAmount, 2)}
                  </td>
                  <td className="py-2.5 pr-4 text-warn">{countdown(a.expiresAt)}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">
                    <ExplorerLink chain={a.chain} address={a.address}>
                      {truncateMiddle(a.address, 10, 8)}
                    </ExplorerLink>
                  </td>
                  <td className="py-2.5 text-right">
                    <button
                      onClick={() => disable.mutate({ chain: a.chain, asset: a.asset })}
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
          One live authorization per asset — authorizing again replaces the previous one.
        </p>
      </div>
    </Panel>
  );
}
