#!/usr/bin/env bash
# MailPost 更新部署 — 邮箱/联系人放在 /var/lib/mailpost，更新代码不会丢掉。
# 用法：
#   cd /opt/mailpost && bash scripts/update.sh
set -euo pipefail

APP_DIR=/opt/mailpost
APP_USER=ec2-user
DATA_DIR=/var/lib/mailpost
PORT=5006

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "未找到 ${APP_DIR}，请先跑 scripts/setup-amazon-linux.sh"
  exit 1
fi

cd "${APP_DIR}"

echo "==> 保护邮箱数据 ${DATA_DIR}"
sudo mkdir -p "${DATA_DIR}/outbox"
if [[ -f ${APP_DIR}/data/mailpost.json && ! -s ${DATA_DIR}/mailpost.json ]]; then
  sudo cp -a "${APP_DIR}/data/mailpost.json" "${DATA_DIR}/mailpost.json"
  echo "    已从 ${APP_DIR}/data 迁到 ${DATA_DIR}"
fi
if [[ -s ${DATA_DIR}/mailpost.json ]]; then
  sudo cp -a "${DATA_DIR}/mailpost.json" "${DATA_DIR}/mailpost.json.bak-$(date +%F-%H%M%S)"
  echo "    已备份当前 mailpost.json"
elif ls -1 "${APP_DIR}/data"/mailpost.json.bak-* >/dev/null 2>&1; then
  latest=$(ls -1t "${APP_DIR}/data"/mailpost.json.bak-* | head -1)
  sudo cp -a "${latest}" "${DATA_DIR}/mailpost.json"
  echo "    已从备份恢复 ${latest}"
fi
sudo chown -R "${APP_USER}:${APP_USER}" "${DATA_DIR}"
sudo chmod 700 "${DATA_DIR}"
if [[ -f ${DATA_DIR}/mailpost.json ]]; then
  sudo chmod 600 "${DATA_DIR}/mailpost.json"
fi

echo "==> git pull"
git pull --ff-only

echo "==> 安装依赖并构建"
rm -rf node_modules
npm install
npm run build

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

if [[ -s ${DATA_DIR}/mailpost.json ]]; then
  echo "==> 邮箱数据仍在 ${DATA_DIR}/mailpost.json"
else
  echo "==> 警告：没有找到邮箱数据。到网页 Gmail 页重新接入。"
fi

ss -lntp | grep "${PORT}" || echo "未听到 ${PORT}，执行： sudo journalctl -u mailpost -e"
echo
echo "更新完成。打开 http://本机公网IP:${PORT}"
echo "接入过的 Gmail 在 ${DATA_DIR}，不要删这个目录。"
