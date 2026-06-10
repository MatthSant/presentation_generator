#!/usr/bin/env bash
# setup.sh — sobe o Dossiê do Consultor numa VM Debian/Ubuntu (Google Cloud e2-micro).
# Uso na VM (depois de descompactar o zip):  bash setup.sh
set -e

HERE="$(cd "$(dirname "$0")" && pwd)"
APP="$HERE/app"

echo "==> 1/5  Instalando dependências do sistema (Node 20, Python 3, build tools)…"
sudo apt-get update -y
sudo apt-get install -y curl python3 build-essential
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 18 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "    node $(node -v) · python $(python3 --version)"

echo "==> 2/5  Instalando pacotes e compilando o app (pode levar 1–3 min)…"
# A e2-micro tem só 1GB de RAM — 2GB de swap evita o build travar por falta de memória.
if [ ! -f /swapfile ]; then
  sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
cd "$APP"
npm ci
npm run build

echo "==> 3/5  Configuração (.env)"
if [ ! -f "$APP/.env" ]; then
  read -r -p "    Cole sua ANTHROPIC_API_KEY: " KEY
  read -r -p "    Email de login (você): " EMAIL
  read -r -s -p "    Senha de login: " PASS; echo
  cat > "$APP/.env" <<EOF
ANTHROPIC_API_KEY=$KEY
SEED_EMAIL=$EMAIL
SEED_PASSWORD=$PASS
PORT=3131
EOF
  echo "    .env criado."
else
  echo "    .env já existe — mantido."
fi
EMAIL="$(grep -E '^SEED_EMAIL=' "$APP/.env" | cut -d= -f2-)"

echo "==> 4/5  Serviço (systemd) — sobe sozinho no boot e reinicia se cair…"
sudo tee /etc/systemd/system/witly.service >/dev/null <<EOF
[Unit]
Description=Dossie do Consultor (Witly)
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP
ExecStart=$(command -v node) dist/server/index.js
Environment=PYTHONUTF8=1
Restart=always
RestartSec=3
User=$USER

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now witly
sleep 2

echo "==> 5/5  Pronto."
IP="$(curl -s -H 'Metadata-Flavor: Google' http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || echo 'IP-DA-VM')"
echo
echo "    Acesse:  http://$IP:3131"
echo "    Login:   $EMAIL  (a senha que você definiu)"
echo
echo "    Status:  sudo systemctl status witly --no-pager"
echo "    Logs:    journalctl -u witly -f"
echo "    Atualizar depois: pare (sudo systemctl stop witly), substitua os arquivos, rode 'cd app && npm ci && npm run build', e 'sudo systemctl start witly'."
