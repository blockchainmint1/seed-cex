#!/usr/bin/env bash
# New Ubuntu 24.04 x86_64 EC2/DO hosts only. No wallet keys are used here.
set -euo pipefail
umask 077
role=${1:-}
[[ $EUID == 0 && $role =~ ^(watch|signer)$ && $(uname -m) == x86_64 ]] || { printf 'Usage: sudo bash bootstrap.sh watch|signer on an x86_64 host\n' >&2; exit 1; }
[[ ! -e /opt/monero && ! -e /etc/systemd/system/seeds-monerod.service ]] || { printf 'Existing Monero installation found; refusing to overwrite.\n' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl bzip2 python3 nginx
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
curl -fL --retry 3 https://downloads.getmonero.org/cli/monero-linux-x64-v0.18.5.4.tar.bz2 -o "$work/monero.tar.bz2"
# Verified against the signed official hashes.txt, binaryFate fingerprint
# 81AC591FE9C4B65C5806AFC3F0AF4D462A0BDF92, on 2026-11-26.
printf '%s  %s\n' ba2928962c101b609434bf8c1b43ad59ebe96c5525977284ca599d8bf0f02d10 "$work/monero.tar.bz2" | sha256sum -c -
tar -xjf "$work/monero.tar.bz2" -C "$work"
install -d -m 755 /opt/monero
install -m 755 "$work/monero-x86_64-linux-gnu-v0.18.5.4/monerod" /opt/monero/monerod
install -m 755 "$work/monero-x86_64-linux-gnu-v0.18.5.4/monero-wallet-rpc" /opt/monero/monero-wallet-rpc
if [[ $role == signer ]]; then
  printf 'Signer binaries installed. No blockchain sync is needed or started on this separate signer host.\n'
  exit 0
fi
id seeds-monero >/dev/null 2>&1 || useradd --system --home-dir /var/lib/seeds-monero --shell /usr/sbin/nologin seeds-monero
install -d -m 700 -o seeds-monero -g seeds-monero /var/lib/seeds-monero
cat > /etc/systemd/system/seeds-monerod.service <<'EOF'
[Unit]
Description=Seeds Monero blockchain watch node
After=network-online.target
Wants=network-online.target
[Service]
User=seeds-monero
ExecStart=/opt/monero/monerod --data-dir /var/lib/seeds-monero/chain --rpc-bind-ip 127.0.0.1 --rpc-bind-port 18081 --no-igd --non-interactive --log-level 0
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/seeds-monero
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now seeds-monerod
printf 'Watch node started syncing. Follow with: sudo journalctl -u seeds-monerod -f\n'