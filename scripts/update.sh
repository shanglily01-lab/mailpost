#!/usr/bin/env bash
# MailPost 更新部署 — 只更新代码。不读、不写、不备份 /var/lib/mailpost。
# 用法：
#   cd /opt/mailpost && bash scripts/update.sh
set -euo pipefail

APP_DIR=/opt/mailpost
APP_USER=ec2-user
PORT=5006

if [[ ! -d "${APP_DIR}/.git" ]]; then
  echo "未找到 ${APP_DIR}，请先跑 scripts/setup-amazon-linux.sh"
  exit 1
fi

cd "${APP_DIR}"

echo "==> 只更新代码。不读、不写、不覆盖邮箱文件，也不改 systemd。"
sudo find "${APP_DIR}" -mindepth 1 -maxdepth 1 ! -name data -exec chown -R "${APP_USER}:${APP_USER}" {} +
sudo chown "${APP_USER}:${APP_USER}" "${APP_DIR}"
echo "==> git pull"
git pull --ff-only

echo "==> 安装依赖并构建"
npm install --no-audit --no-fund
git checkout -- package.json package-lock.json
MAILPOST_SKIP_DATA=1 npm run build

echo "==> 重启服务"
if [[ -f /etc/systemd/system/mailpost.service ]]; then
  sudo systemctl restart mailpost
  sleep 2
  sudo systemctl --no-pager --full status mailpost || true
else
  echo "还没有 systemd 单元。更新脚本不会创建它，避免改到邮箱数据目录。"
  exit 1
fi

ss -lntp | grep "${PORT}" || echo "未听到 ${PORT}，执行： sudo journalctl -u mailpost -e"
echo
echo "更新完成。只更新了代码，邮箱数据没有改。"
echo "打开 http://本机公网IP:${PORT}"
