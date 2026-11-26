#!/usr/bin/env bash
# Run only on the chosen NEW dedicated watch/signer host after auditor review.
set -euo pipefail
umask 077
role=${1:-}
host=${2:-}
cert=${3:-}
key=${4:-}
if [[ $EUID != 0 || ! $role =~ ^(watch|signer)$ || ! $host =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ || ! $cert =~ ^/[a-zA-Z0-9_./-]+$ || ! $key =~ ^/[a-zA-Z0-9_./-]+$ || ! -f $cert || ! -f $key ]]; then
  printf 'Usage (root): install.sh watch|signer actual-hostname existing-fullchain.pem existing-privkey.pem\n' >&2
  exit 1
fi
for bin in /opt/monero/monero-wallet-rpc /opt/monero/monerod; do
  [[ -x $bin ]] || { printf 'Install verified official Monero binaries into /opt/monero first.\n' >&2; exit 1; }
done
[[ ! -e /etc/seeds-monero ]] || { printf 'Existing configuration found; refusing to overwrite it.\n' >&2; exit 1; }
command -v nginx >/dev/null
command -v python3 >/dev/null
script_dir=$(dirname "$(readlink -f "$0")")
id seeds-monero >/dev/null 2>&1 || useradd --system --home-dir /var/lib/seeds-monero --shell /usr/sbin/nologin seeds-monero
id seeds-monero-proxy >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin seeds-monero-proxy
install -d -m 700 -o seeds-monero -g seeds-monero /var/lib/seeds-monero
install -d -m 755 /etc/seeds-monero /opt/seeds-monero
install -m 644 "$script_dir/proxy.py" /opt/seeds-monero/proxy.py
rpc_password=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
gateway_token=$(python3 -c 'import secrets; print(secrets.token_hex(32))')
printf 'MONERO_ROLE=%s\nRPC_PASSWORD=%s\nGATEWAY_TOKEN=%s\n' "$role" "$rpc_password" "$gateway_token" > /etc/seeds-monero/proxy.env
wallet_dir=/var/lib/seeds-monero/wallets
extra='daemon-address=127.0.0.1:18081'
mount_line=''
if [[ $role == signer ]]; then
  wallet_dir=/wallets
  extra='offline=1'
  mount_line="TemporaryFileSystem=/wallets:rw,nosuid,nodev,noexec,size=512M,mode=0700,uid=$(id -u seeds-monero),gid=$(id -g seeds-monero)"
else
  install -d -m 700 -o seeds-monero -g seeds-monero "$wallet_dir"
fi
printf 'rpc-bind-ip=127.0.0.1\nrpc-bind-port=18088\nrpc-login=seeds:%s\nwallet-dir=%s\nlog-file=/dev/null\nlog-level=0\n%s\n' "$rpc_password" "$wallet_dir" "$extra" > /etc/seeds-monero/wallet.conf
chown root:seeds-monero /etc/seeds-monero/wallet.conf
chmod 640 /etc/seeds-monero/wallet.conf
cat > /etc/systemd/system/seeds-monero-wallet.service <<EOF
[Unit]
Description=Seeds Monero $role wallet RPC
After=network.target
[Service]
User=seeds-monero
Group=seeds-monero
ExecStart=/opt/monero/monero-wallet-rpc --config-file /etc/seeds-monero/wallet.conf
Restart=on-failure
UMask=0077
LimitCORE=0
MemorySwapMax=0
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/seeds-monero
IPAddressDeny=any
IPAddressAllow=localhost
$mount_line
StandardOutput=null
StandardError=null
[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/seeds-monero-proxy.service <<'EOF'
[Unit]
Description=Seeds Monero authenticated method-filter gateway
After=seeds-monero-wallet.service
[Service]
User=seeds-monero-proxy
EnvironmentFile=/etc/seeds-monero/proxy.env
ExecStart=/usr/bin/python3 /opt/seeds-monero/proxy.py
Restart=on-failure
LimitCORE=0
MemorySwapMax=0
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
IPAddressDeny=any
IPAddressAllow=localhost
StandardOutput=null
StandardError=null
[Install]
WantedBy=multi-user.target
EOF
if [[ $role == watch ]]; then
  cat > /etc/systemd/system/seeds-monerod.service <<'EOF'
[Unit]
Description=Seeds Monero blockchain watch node
After=network.target
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
fi
cat > /etc/nginx/conf.d/seeds-monero-acme.conf <<EOF
server {
    listen 80;
    server_name $host;
    access_log off;
    error_log /dev/null;
    location /.well-known/acme-challenge/ { root /var/www/html; }
    location / { return 404; }
}
EOF
cat > /etc/nginx/conf.d/seeds-monero.conf <<EOF
server {
    listen 443 ssl;
    server_name $host;
    ssl_certificate $cert;
    ssl_certificate_key $key;
    ssl_protocols TLSv1.2 TLSv1.3;
    access_log off;
    error_log /dev/null;
    client_max_body_size 16m;
    location = /json_rpc {
        proxy_pass http://127.0.0.1:18089/json_rpc;
        proxy_read_timeout 75s;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_max_temp_file_size 0;
        proxy_set_header Authorization \$http_authorization;
    }
    location / { return 404; }
}
EOF
nginx -t
systemctl daemon-reload
if [[ $role == watch ]]; then systemctl enable --now seeds-monerod; fi
systemctl enable --now seeds-monero-wallet seeds-monero-proxy
systemctl reload nginx
printf 'Installed %s services. Gateway credential is in root-only /etc/seeds-monero/proxy.env; do not paste it into chat.\n' "$role"