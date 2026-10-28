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

echo "==> 只更新代码，不碰邮箱数据"
# 只改代码文件的属主。data 目录和 /var/lib/mailpost 都不进这里。
sudo find "${APP_DIR}" -mindepth 1 -maxdepth 1 ! -name data -exec chown -R "${APP_USER}:${APP_USER}" {} +
sudo chown "${APP_USER}:${APP_USER}" "${APP_DIR}"
echo "==> git pull"
git pull --ff-only

echo "==> 安装依赖并构建"
# 服务器上的 npm 10 会对这份锁文件报缺 @emnapi。npm install 能装上，装完把锁文件还原，避免下次 pull 被本地改动挡住。
# 构建期间禁止读写 mailpost.json，避免 next build 另写一份空邮箱文件。
npm install --no-audit --no-fund
git checkout -- package.json package-lock.json
MAILPOST_SKIP_DATA=1 npm run build

echo "==> 重启服务"
# 不覆盖 systemd 单元。覆盖会改 MAILPOST_DATA_DIR，应用就会改读另一份邮箱文件。
if [[ -f /etc/systemd/system/mailpost.service ]]; then
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
echo "更新完成。只更新了代码，邮箱数据没有改。"
echo "打开 http://本机公网IP:${PORT}"
