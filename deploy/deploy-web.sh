#!/usr/bin/env bash
# Deploy agent-assist-console (static SPA) to the Lighthouse server.
#
# Usage:
#   bash deploy/deploy-web.sh               # build + upload + configure + verify
#   bash deploy/deploy-web.sh --skip-build  # reuse existing dist/
#
# Override with env vars: SERVER_IP (required), SSH_USER, SSH_KEY
set -euo pipefail

SERVER_IP="${SERVER_IP:?请先设置 SERVER_IP 环境变量，例如 SERVER_IP=203.0.113.10 bash deploy/deploy-web.sh}"
SSH_USER="${SSH_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ "${1:-}" != "--skip-build" ]; then
  echo "==> [1/5] build"
  npm run build
else
  echo "==> [1/5] build skipped"
fi

echo "==> [2/5] pack dist/"
TAR_FILE="/tmp/aac-dist.tar.gz"
tar -czf "$TAR_FILE" -C dist .

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -i "$SSH_KEY")
TARGET="${SSH_USER}@${SERVER_IP}"

echo "==> [3/5] upload"
scp "${SSH_OPTS[@]}" "$TAR_FILE" "${TARGET}:/tmp/aac-dist.tar.gz"
scp "${SSH_OPTS[@]}" deploy/nginx-site.conf "${TARGET}:/tmp/aac-site.conf"

echo "==> [4/5] install on server"
ssh "${SSH_OPTS[@]}" "$TARGET" bash -s <<'REMOTE'
set -euo pipefail

sudo mkdir -p /var/www/aac
sudo rm -rf /var/www/aac/assets /var/www/aac/index.html
sudo tar -xzf /tmp/aac-dist.tar.gz -C /var/www/aac
sudo chown -R www-data:www-data /var/www/aac
sudo chmod -R 755 /var/www/aac

SITE=/etc/nginx/sites-available/keep-screen
if [ ! -f "${SITE}.bak-aac" ]; then
  sudo cp "$SITE" "${SITE}.bak-aac"
  echo "    original site config saved as ${SITE}.bak-aac"
fi
sudo install -m 644 /tmp/aac-site.conf "$SITE"
sudo nginx -t
sudo systemctl reload nginx

echo "==> [5/5] verify on server"
# nginx reload is asynchronous: old workers can still answer with the previous config briefly
AAC_CODE=000
for i in 1 2 3 4 5 6; do
  AAC_CODE=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1/aac/)
  [ "$AAC_CODE" = "200" ] && break
  sleep 1
done
if [ "$AAC_CODE" != "200" ]; then
  echo "    ERROR: /aac/ returned ${AAC_CODE} after nginx reload"
  exit 1
fi
printf '    /aac/        : %s\n' "$AAC_CODE"
printf '    /aac/ asset  : '; curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "http://127.0.0.1/aac/$(cd /var/www/aac && ls assets/*.js | head -1)"
printf '    /version.json: '; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/version.json
printf '    /apks/       : '; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1/apks/
REMOTE

rm -f "$TAR_FILE"
echo "==> done: http://${SERVER_IP}/aac/"
