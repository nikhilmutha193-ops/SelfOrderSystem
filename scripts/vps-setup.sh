#!/bin/sh
# One-time preparation of a fresh Ubuntu or Debian VPS for SelfOrder. Run it as root:
#
#   sudo sh vps-setup.sh [deploy-user] [git-repository-url]
#
#   deploy-user          the login that will run the app (default: selforder). Created if missing.
#   git-repository-url   if given, the project is cloned into /opt/selforder.
#
# It is safe to run again. It installs Docker, turns on a firewall (only SSH, 80 and 443), adds fail2ban against
# password guessing, switches on automatic security updates, and adds swap on small servers.
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this as root: sudo sh $0" >&2
  exit 1
fi

DEPLOY_USER="${1:-selforder}"
REPO_URL="${2:-}"
APP_DIR="/opt/selforder"

echo "==> Updating packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw fail2ban unattended-upgrades

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

echo "==> Creating the login '$DEPLOY_USER'"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
usermod -aG docker "$DEPLOY_USER"
# Let the new login sign in with the same SSH key you used for root.
if [ -f /root/.ssh/authorized_keys ]; then
  mkdir -p "/home/$DEPLOY_USER/.ssh"
  cp /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  chmod 700 "/home/$DEPLOY_USER/.ssh"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
fi

echo "==> Firewall: allow SSH, HTTP and HTTPS only"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> fail2ban and automatic security updates"
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades || true

echo "==> Swap (small servers run out of memory while building)"
mem_mb=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
if [ "$mem_mb" -lt 3500 ] && ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Added 2 GB of swap."
fi

echo "==> The app folder"
mkdir -p "$APP_DIR"
if [ -n "$REPO_URL" ] && [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"

cat <<EOF

Server is ready.

Next, from your own computer:
  1. Sign in as the new login:   ssh $DEPLOY_USER@<server address>
  2. Go to the app folder:       cd $APP_DIR
  3. Follow docs/VPS_DEPLOY.md from step 4 (settings in .env, then ./scripts/deploy.sh first).

Before you close this session, open a SECOND terminal and check you can still sign in as $DEPLOY_USER.
EOF
