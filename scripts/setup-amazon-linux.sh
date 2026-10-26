#!/usr/bin/env bash
# MailPost 首次部署 — Amazon Linux 2023 / 端口 5006
# 用法（ec2-user）：
#   curl -fsSL 不可用时，把本文件拷到服务器后：
#   bash scripts/setup-amazon-linux.sh
set -euo pipefail

APP_DIR=/opt/mailpost
REPO=https://github.com/shanglily01-lab/mailpost.git
APP_USER=ec2-user
PORT=5006

if [[ "$(id -u)" -eq 0 ]]; then
  echo "请用 ec2-user 运行，需要 sudo 时脚本会自己调。"
  exit 1
fi

echo "==> 安装系统依赖和 Node 22"
sudo dnf update -y
sudo dnf install -y gcc-c++ make tar git
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]]; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | sudo bash -
  sudo dnf install -y nodejs
fi
node -v
npm -v

echo "==> 确保有 2G swap（构建时防 OOM）"
if ! sudo swapon --show | grep -q .; then
  if [[ ! -f /swapfile ]]; then
    sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
  fi
  sudo swapon /swapfile || true
fi

echo "==> 拉取代码到 ${APP_DIR}"
sudo mkdir -p "${APP_DIR}"
sudo chown "${APP_USER}:${APP_USER}" "${APP_DIR}"
if [[ ! -d "${APP_DIR}/.git" ]]; then
  git clone "${REPO}" "${APP_DIR}"
else
  git -C "${APP_DIR}" pull --ff-only
fi

cd "${APP_DIR}"
sudo mkdir -p /var/lib/mailpost/outbox
echo "    不从代码目录拷贝邮箱。服务器上的 Gmail 只在网页里接入，更新不会改。"
sudo chown -R "${APP_USER}:${APP_USER}" /var/lib/mailpost
sudo chmod 700 /var/lib/mailpost
mkdir -p data/outbox
chmod 700 data
if [[ -f /var/lib/mailpost/mailpost.json ]]; then
  chmod 600 /var/lib/mailpost/mailpost.json
fi

echo "==> 安装依赖并构建"
rm -rf node_modules
npm install
npm run build

echo "==> systemd"
sudo cp "${APP_DIR}/docs/mailpost.service" /etc/systemd/system/mailpost.service
sudo systemctl daemon-reload
sudo systemctl enable mailpost
sudo systemctl restart mailpost

echo "==> 本机防火墙（若 firewalld 在跑）"
if systemctl is-active --quiet firewalld; then
  sudo firewall-cmd --permanent --add-port="${PORT}/tcp"
  sudo firewall-cmd --reload
fi

sleep 2
sudo systemctl --no-pager --full status mailpost || true
ss -lntp | grep "${PORT}" || echo "尚未听到 ${PORT}，看 journalctl -u mailpost -e"

echo
echo "完成。浏览器打开 http://本机公网IP:${PORT}"
echo "AWS 安全组入站还要放行 TCP ${PORT}（来源用你的办公网 IP）。"
echo "Gmail 在 /var/lib/mailpost/mailpost.json。不要用本机文件覆盖它。缺了邮箱就在网页 Gmail 页接入。"
