#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git

if ! command -v node >/dev/null 2>&1 || ! node -v | grep -qE 'v(1[8-9]|[2-9][0-9])'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

echo "Node: $(node -v)"

mkdir -p /opt/oslofjord-domki
if [ -d /opt/oslofjord-domki/.git ]; then
  git -C /opt/oslofjord-domki pull --ff-only
else
  rm -rf /opt/oslofjord-domki
  git clone https://github.com/lukaspoloki/oslofjord-domki.git /opt/oslofjord-domki
fi

cp /opt/oslofjord-domki/bot/oslofjord-bot.service /etc/systemd/system/
systemctl daemon-reload

if [ ! -f /opt/oslofjord-domki/bot/.env ]; then
  cp /opt/oslofjord-domki/bot/.env.example /opt/oslofjord-domki/bot/.env
fi
chmod 600 /opt/oslofjord-domki/bot/.env

echo "DONE — uzupełnij /opt/oslofjord-domki/bot/.env i uruchom:"
echo "  systemctl enable --now oslofjord-bot"
echo "  systemctl status oslofjord-bot"
