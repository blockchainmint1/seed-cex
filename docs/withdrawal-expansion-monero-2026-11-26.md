# Seeds withdrawal expansion and Monero host preparation — auditor handoff

Date: 2026-11-26. Baseline: efd6969154a9b4579306a908213d3e63dec1e7d0.
The shareable copy includes the exact final git commit below. Nothing was published or provisioned.

## Owner authorization and scope

Bobby confirmed funded testing of the native Stellar, TON and Sui families and approved opening them to eligible members. He requested Ethereum wTXC/wISK/wZCU withdrawals, Monero EC2 + DigitalOcean preparation, and Zcash withdrawals. This batch completes the first two code changes and Monero preparation, not live Monero or Zcash activation.

## Code changed

- `pockets/ed-send-rules.ts`: native XLM/TON/SUI and TON USD₮ stage becomes open. Existing readiness, native reserves, fee caps, link timing, email-code binding, fresh authenticator and Telegram checks remain. The STON.fi gate uses that existing stage; global swap/tester restrictions were not removed.
- `chains.ts`, `withdraw/catalog.ts`, `account/deposit-options.ts`: pinned ecosystem Ethereum contracts reused for dedicated balance, receive and protected EVM withdrawal rows. wTXC/wISK have 8 decimals; wZCU 18. ETH pays fees. No new wallet key, generic arbitrary-token withdrawal, external spending address or signing implementation introduced.
- `account/erc-tokens.ts`: known tokens moved to main rows are excluded from duplicate extra-token rows and protected from symbol spoofing. Unknown token display remains display-only.
- `withdraw/withdraw.server.ts`: ecosystem withdrawal limit valuation by canonical Ethereum contract through the existing DEX token-market lookup. A missing price does not bypass ordinary-member value limits. Tester behavior remains existing behavior. Prices are display/risk valuation, not swap execution prices.
- `account/swap-link.ts`, `/swap`: main wrapped-token rows prefill canonical wrapped symbols, resolved to pinned Ethereum contracts; holdings sell to TSD, zero holdings buy with TSD. No user-supplied arbitrary contract accepted in this new URL branch. Existing pool price checks, slippage and one Telegram approval are unchanged.
- No SQL migrations, schedules, permissions, secrets or deployed infrastructure changed.

## Monero deployment tooling: `infra/monero/`

- Bootstrap: new Ubuntu 24.04 x86_64 hosts only. Official v0.18.5.4 CLI SHA-256 `ba2928962c101b609434bf8c1b43ad59ebe96c5525977284ca599d8bf0f02d10` was verified against binaryFate's signed official hashes (GPG fingerprint `81AC591FE9C4B65C5806AFC3F0AF4D462A0BDF92`). The downloaded executable's version and extraction path were checked. Installs binaries then starts only the watch daemon, RPC on loopback. Full, not pruned, blockchain. Refuses existing installations.
- Watch host: syncing daemon and view-only wallets. Offline signer is a different machine; no daemon or sync on signer. “Offline” means no outbound blockchain access, not physically air-gapped.
- `install.sh` adds TLS nginx → bearer-authenticated loopback Python method-filter gateway → digest-authenticated loopback wallet RPC, distinct generated credentials per machine. TLS filenames/hostname constrained; no printed credentials, gateway access log or request buffering to disk. Request bodies capped at 16 MiB. Project secrets supplied separately by operator.
- Signer wallet directory is a service-private tmpfs with explicit wallet-user uid/gid, no swap for service, no cores, no wallet/process output logs, loopback-only egress. The deployment requires real cgroup v2 and systemd sandbox enforcement, no RAM snapshots, swap/hibernation or body-capturing infrastructure. These are operator/auditor verification requirements, not proven by the sandbox.
- Proxy forbids watch spend keys/sending and restricts signer to cold-sign methods. App cold-sign/lease logic is unchanged. The gateway credential authorizes powerful signer methods; treat it as a high-value secret and evaluate host compromise, ingress restriction, crash/restart behavior and upstream logs.
- Existing wallet creation job remains the one scheduled key unlock, and XMR still refuses deposit/send activation without both configured hosts and a ready member watch wallet.

## Zcash NOT activated

Seeds derives a transparent secp256k1 Zcash pocket, but it lacks a current-format tested sender. ZIP-244 v5 signatures, branch/expiry evidence, fee calculation, ownership/UTXO verification and confirmed delivery are required; ordinary Bitcoin serialization is not valid here. The temporary BitGo `@bitgo/utxo-lib` 11.25.1 probe remains outside the project; no package was added to Seeds. An isolated workerd baseline succeeded, but the package probe still failed to start (bundle CommonJS/builtin import handling, including dynamic `node:buffer` imports); this is a qualification failure, not proof that every integration approach is impossible. No Zcash RPC provider has been validated for branch/tip/submit. ZEC stays closed to prevent a one-way deposit or untested send.

## Validation performed

- Full `bun test`: **1,726 pass, 0 fail**, 140 files.
- Monero Python allowlist tests: **5 pass**. Both scripts pass `bash -n`. This does not prove a real systemd/nginx host installation or cold-sign mainnet round trip.
- Latest automatic app validation: build OK.
- Signed in as owner: all three wrapped coin withdrawal forms, TON and TON USD₮ forms render with the existing member pocket and no observed page exceptions. No withdrawal code requested and no money sent by the agent.
- Signed-in Balances → Swap clicks for all three wrapped tokens yield `/swap?from=TSD&to=wTXC` / wISK / wZCU; the receive picker visibly shows the matching coin on Ethereum. Picker element screenshots inspected; no screenshots captured on withdrawal or Security pages.
- Public access rule is covered by stage/readiness tests; browser verification used the owner/tester account, so ordinary-member actual funded sends were not exercised.
- Existing relevant routes already carry app-specific page titles/descriptions, Open Graph and Twitter metadata. No new content routes added.

## Independent evaluation and owner follow-ups

1. Review widened stage access and all unchanged financial guards; check canonical token metadata and value-limit failure behavior.
2. Funded Ethereum wrapper withdrawal for each token, verifying recipient contract/event, exact units and ETH fee. No such test was performed here.
3. Audit and run host installation on dedicated machines; verify tmpfs, egress and swap controls, unauthorized RPC refusal, signer wallet destruction on restart and absence of persistent wallet/key/request logs. Configure real HTTPS hostnames and project secrets only after acceptance.
4. Finish watch sync and conduct staged then small owner-approved XMR deposit → cold sign → submit → confirmation, including errors/crash recovery. Never advertise Monero ready before this.
5. Zcash remains separate, blocked work. It requires a qualified sender/provider and independent review before activation.

No publish authorization is implied by this handoff.