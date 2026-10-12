#!/usr/bin/env bash
# MailPost 更新部署 — 不覆盖 data/mailpost.json
# 用法：
#   cd /opt/mailpost && bash scripts/update.sh
set -euo pipefail

APP_DIR=/opt/mailpost
PORT=5006

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "未找到 ${APP_DIR}，请先跑 scripts/setup-amazon-linux.sh"
  exit 1
fi

cd "${APP_DIR}"

if [[ -f data/mailpost.json ]]; then
  mkdir -p data
  cp -a data/mailpost.json "data/mailpost.json.bak-$(date +%F-%H%M%S)"
  echo "==> 已备份 data/mailpost.json"
fi

echo "==> git pull"
git pull --ff-only

echo "==> 安装依赖并构建"
rm -rf node_modules
npm install
npm run build

mkdir -p data/outbox
chmod 700 data
if [[ -f data/mailpost.json ]]; then
  chmod 600 data/mailpost.json
fi

echo "==> 重启服务"
if [[ -f /etc/systemd/system/mailpost.service ]]; then
  sudo cp "${APP_DIR}/docs/mailpost.service" /etc/systemd/system/mailpost.service
  sudo systemctl daemon-reload
  sudo systemctl restart mailpost
  sleep 2
  sudo systemctl --no-pager --full status mailpost || true
else
  echo "还没有 systemd 单元，先执行："
  echo "  sudo cp ${APP_DIR}/docs/mailpost.service /etc/systemd/system/mailpost.service"
  echo "  sudo systemctl daemon-reload && sudo systemctl enable --now mailpost"
  exit 1
fi

ss -lntp | grep "${PORT}" || echo "未听到 ${PORT}，执行： sudo journalctl -u mailpost -e"
echo
echo "更新完成。打开 http://本机公网IP:${PORT}"
