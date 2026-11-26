# Seeds Monero deployment bundle — requires independent review

This bundle prepares **two dedicated Linux hosts**, not an app-hosted blockchain node. It has not provisioned either host. Do not run it on a shared production box without reviewing existing users, services, ports and nginx configuration.

## Separation

- **Watch host:** synced `monerod`, encrypted view-only wallet files and authenticated wallet RPC. No spend key is accepted by its gateway.
- **Signer host:** `monero-wallet-rpc --offline`, no blockchain daemon, wallet files mounted on a per-service RAM-only filesystem, swap disabled for the service, no core dumps or service/request logs. Network access for wallet RPC and gateway is loopback-only; HTTPS nginx accepts incoming app calls. "Offline" means no blockchain/outbound network, not an air-gapped machine.
- Install each role on a different machine, with a different gateway token and hostname. Never combine roles.

## Host preparation

1. Use supported Linux with systemd/cgroup v2, nginx and Python 3. Verify systemd IP filtering and MemorySwapMax actually apply; reject hosts that cannot enforce them. Disable host swap/hibernation and crash capture on the signer; do not snapshot RAM.
2. `sudo bash bootstrap.sh watch` starts blockchain sync on a new Ubuntu 24.04 x86_64 watch host; `sudo bash bootstrap.sh signer` installs binaries without a daemon on the separate signer. Bootstrap pins official v0.18.5.4 and its independently signature-verified SHA-256; it refuses an existing installation. The watch bootstrap uses a full, not pruned, blockchain and needs ample disk capacity. Wallet services and TLS are not activated at this stage.
3. Arrange real DNS names and trusted TLS certificates for each machine. Certificate paths must be absolute and must not contain whitespace or nginx control characters. Restrict ingress at the hosting firewall to HTTPS and approved administrative access; never expose 18081, 18088 or 18089. A TLS edge with authenticated origin access is preferred. Disable request body capture in any upstream proxy, WAF, APM or backups.
4. Copy this directory onto each selected host. Run `bash install.sh watch ACTUAL_HOST ABSOLUTE_CERT_PATH ABSOLUTE_KEY_PATH` on the watch machine, and the same command with `signer` on the separate signer machine. Arguments are values from your host setup, not literal placeholders.
5. The script generates independent random RPC and gateway credentials locally and refuses existing configuration. It never prints credential values. Read the root-only gateway credential locally into the project's secret-entry form, not chat.

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