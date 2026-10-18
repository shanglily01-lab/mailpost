#!/usr/bin/env bash
# 在 AWS Linux 上检查能不能连 Gmail SMTP。不发信、不需要密码。
set -u

echo "== DNS =="
getent ahostsv4 smtp.gmail.com | head -n 5 || true

probe() {
  local port="$1"
  echo "== TCP smtp.gmail.com:${port} =="
  if command -v nc >/dev/null 2>&1; then
    if timeout 8 nc -zv smtp.gmail.com "$port"; then
      echo "PORT ${port}: OK"
      return 0
    fi
    echo "PORT ${port}: FAIL"
    return 1
  fi
  if timeout 8 bash -c "echo >/dev/tcp/smtp.gmail.com/${port}"; then
    echo "PORT ${port}: OK"
    return 0
  fi
  echo "PORT ${port}: FAIL"
  return 1
}

probe 587
probe 465
probe 25

echo
echo "587 或 465 有一个 OK，就可以发。"
echo "两个都 FAIL：看安全组出站、NACL，并到 AWS 申请解除发信限制："
echo "https://aws.amazon.com/premiumsupport/knowledge-center/ec2-port-25-throttle/"
