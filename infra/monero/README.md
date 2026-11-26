# Seeds Monero deployment bundle — requires independent review

This bundle prepares **two dedicated Linux hosts**, not an app-hosted blockchain node. It has not provisioned either host. Do not run it on a shared production box without reviewing existing users, services, ports and nginx configuration.

## Separation

- **Watch host:** synced `monerod`, encrypted view-only wallet files and authenticated wallet RPC. No spend key is accepted by its gateway.
- **Signer host:** `monero-wallet-rpc --offline`, no blockchain daemon, wallet files mounted on a per-service RAM-only filesystem, swap disabled for the service, no core dumps or service/request logs. Network access for wallet RPC and gateway is loopback-only; HTTPS nginx accepts incoming app calls. "Offline" means no blockchain/outbound network, not an air-gapped machine.
- Install each role on a different machine, with a different gateway token and hostname. Never combine roles.

## Fixed host names

| Host | Address | Role |
| --- | --- | --- |
| EC2 | `node-xmr.honest.money` | The Monero node: `monerod`, full blockchain sync, watch-only wallets, broadcast |
| DigitalOcean | `sign-xmr.honest.money` | Offline signer: no daemon, RAM-only wallets, signs one checked payment |

Both DNS names must point at the matching host's public address before a certificate can be issued.

## Host preparation

1. Use supported Linux with systemd/cgroup v2, nginx and Python 3. Verify systemd IP filtering and MemorySwapMax actually apply; reject hosts that cannot enforce them. Disable host swap/hibernation and crash capture on the signer; do not snapshot RAM.
2. `sudo bash bootstrap.sh watch` starts blockchain sync on a new Ubuntu 24.04 x86_64 watch host; `sudo bash bootstrap.sh signer` installs binaries without a daemon on the separate signer. Bootstrap pins official v0.18.5.4 and its independently signature-verified SHA-256; it refuses an existing installation. The watch bootstrap uses a full, not pruned, blockchain and needs ample disk capacity. Wallet services and TLS are not activated at this stage.
3. Point each DNS name at its host's public address and open port 80 on that host for certificate issuance and renewals. Never expose 18081, 18088 or 18089. A TLS edge with authenticated origin access is preferred. Disable request body capture in any upstream proxy, WAF, APM or backups.
4. Issue a trusted certificate on each host. Emit the block with `python3 paste_commands.py cert watch node-xmr.honest.money` on EC2 and `python3 paste_commands.py cert signer sign-xmr.honest.money` on DigitalOcean, then paste it. It installs certbot, requests the certificate and prints both file paths. Add `--email someone@honest.money` to receive renewal notices.
5. Install the wallet services from an emitted block: `python3 paste_commands.py install watch node-xmr.honest.money --cert /etc/letsencrypt/live/node-xmr.honest.money/fullchain.pem --key /etc/letsencrypt/live/node-xmr.honest.money/privkey.pem` on EC2, and the `signer` form with the signer's own certificate paths on DigitalOcean. The block writes the bundle files itself, so this directory does not have to be copied by hand. It removes nginx's default site and keeps only a port-80 ACME path plus the authenticated HTTPS endpoint.
6. The script generates independent random RPC and gateway credentials locally and refuses existing configuration. It never prints credential values. Read the root-only gateway credential locally into the project's secret-entry form, not chat. If a run aborts part way, remove `/etc/seeds-monero`, the `seeds-monero*` unit files and the `seeds-monero*` nginx files before retrying.

## Project secrets (currently absent)

| Setting | Value supplied by hosting operator |
| --- | --- |
| `MONERO_WALLET_RPC_URL` | Watch HTTPS origin without `/json_rpc` |
| `MONERO_WALLET_RPC_TOKEN` | Watch `GATEWAY_TOKEN` |
| `MONERO_SIGNER_RPC_URL` | Different signer HTTPS origin |
| `MONERO_SIGNER_RPC_TOKEN` | Different signer `GATEWAY_TOKEN` |
| `MONERO_WALLET_FILE_SECRET` | Separately generated random secret, at least 24 characters, kept in project secrets only |

Do not put these values in git, chat, nginx access logs or the audit report. Back up the watch files encrypted, separately from their file secret; no signer wallets, memory or keys may be backed up.

## Verification before enabling real money

- `python3 -m unittest discover -s infra/monero -p 'test_*.py'` verifies method restrictions; it does not prove host isolation.
- Check service logs contain no wallet material and `systemctl show` plus filesystem inspection proves RAM-only wallet writes and cgroup network/swap enforcement. The wallet mount is private to its process; inspecting `/wallets` from the host namespace is not sufficient.
- Unauthorized HTTPS calls and unlisted methods must fail; authenticated `get_version` works on both hosts. Signer calls must not reach the blockchain and wallet files must disappear on service restart.
- Wait for full node synchronization. Verify the existing `/api/public/jobs/monero` schedule runs with the existing job authentication; do not expose or copy its secret into this host.
- Use a fresh stagenet integration environment with matching chain settings for cold-sign testing before mainnet. Current Seeds application addresses are mainnet; do not silently point production at stagenet.
- Auditor evaluates deployment and existing `src/lib/monero` cold-sign/lease/recovery paths, then owner funds a small mainnet deposit and approves a withdrawal. Verify delivered txid, balance and confirmation before telling members it works.

References: https://docs.getmonero.org/interacting/monero-wallet-rpc-reference/ and https://docs.getmonero.org/rpc-library/wallet-rpc/.