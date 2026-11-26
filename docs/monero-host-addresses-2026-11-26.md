# Monero host addresses, certificate and service paste blocks — auditor handoff

Date: 2026-11-26. Scope: host tooling under `infra/monero/` only. No application money path,
no wallet key, and no project secret was created, read or changed by this work.

## What the operator confirmed

- EC2 watch host is syncing (`monerod`, full chain).
- DigitalOcean signer host has verified binaries and no daemon or sync.
- Addresses chosen by the owner: `node-xmr.honest.money` for the node-like EC2 box,
  `sign-xmr.honest.money` for the separate DigitalOcean signer.

## What changed

1. `infra/monero/paste_commands.py` now emits three block kinds, all through one emitter so
   every block is syntax-testable before it is shown to the operator:
   - `bootstrap` (unchanged behaviour): verified binaries, watch-node sync.
   - `cert`: installs certbot, requests a Let's Encrypt certificate for one named host,
     prints the resulting full-chain and private-key paths. No wallet material.
   - `install`: writes `install.sh` and `proxy.py` into a root-only bundle directory on the
     host and runs them for that host's role and certificate paths, so the operator does not
     copy the directory by hand.
2. `infra/monero/install.sh` gained a port-80 nginx server that serves only
   `/.well-known/acme-challenge/` for the host's own name and returns 404 elsewhere. This is
   required so the 90-day certificate can renew non-interactively; the authenticated RPC
   listener stays on loopback and the HTTPS server keeps `access_log off`.
3. `infra/monero/test_paste_commands.py` parses every emitted block with `bash -n` only
   (never the installer commands), asserts the closing delimiter is present exactly once and
   that bash produced no stderr, asserts the embedded `install.sh` and `proxy.py` are byte for
   byte the source files, asserts the real host names and certificate paths reach the final
   command line, and asserts malformed hosts, emails, paths and roles are refused.
   18 tooling tests pass, including the 5 existing gateway-rule tests.
4. `infra/monero/README.md` records both fixed addresses and the operator order:
   DNS → certificate block → install block → read the gateway credential into project secrets.
5. Operator paste files were generated for both hosts and each parses cleanly:
   `monero-1-node-xmr-certificate.sh`, `monero-2-node-xmr-install.sh`,
   `monero-3-sign-xmr-certificate.sh`, `monero-4-sign-xmr-install.sh`.

## Safety properties to re-check on the hosts

- The two hosts keep different gateway tokens and different host names; roles are never combined.
- 18081, 18088 and 18089 remain loopback-only; only 443 (and the ACME path on 80) is reachable.
- The signer still has no daemon, RAM-only wallet mount, no swap, no core dumps, no request logs.
- Generated credentials are never printed; the operator reads `/etc/seeds-monero/proxy.env`
  locally into the project's secret-entry form.
- The install block removes nginx's default site, so no unrelated name is served.
- If a run aborts, `/etc/seeds-monero`, the `seeds-monero*` unit files and the
  `seeds-monero*` nginx files must be removed before retrying.

## Still open before any wallet key or money moves

1. DNS for both names pointed at the correct public addresses, port 80 open for issuance.
2. Certificate and install blocks run on each host; results reviewed.
3. The five `MONERO_*` settings filled from the two hosts plus a separately generated
   `MONERO_WALLET_FILE_SECRET`; `MONERO_SIGNER_RPC_URL`/`_TOKEN` must differ from the watch host.
4. Full EC2 sync, then the verification list in `infra/monero/README.md`, then a small
   owner-approved mainnet deposit and withdrawal.
5. Zcash transparent withdrawals remain blocked: no qualified current-format signer.
