#!/bin/bash
# ╔══════════════════════════════════════════════════════╗
# ║    RISE WHATSAPP — Instalador do Cron Worker         ║
# ║    Execute na VPS Hostinger como root                ║
# ╚══════════════════════════════════════════════════════╝

echo ""
echo "======================================================"
echo "  Rise WhatsApp — Instalando Cron Worker na VPS"
echo "======================================================"
echo ""

# 1. Verificar Node.js
if ! command -v node &> /dev/null; then
  echo "[INFO] Instalando Node.js..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
else
  NODE_VER=$(node -v)
  echo "[OK] Node.js já instalado: $NODE_VER"
fi

# 2. Criar pasta do worker
echo "[INFO] Criando pasta /root/rise-cron..."
mkdir -p /root/rise-cron
cp worker.js /root/rise-cron/worker.js
cp config.json /root/rise-cron/config.json

echo ""
echo "======================================================"
echo "  IMPORTANTE: Edite o config.json com suas instâncias"
echo "======================================================"
echo ""
echo "  nano /root/rise-cron/config.json"
echo ""
echo "  Coloque o nome correto de cada instância:"
echo "  - inst_gustavoc: nome da instância do Gustavo"
echo "  - inst_giuliab:  nome da instância da Giulia"
echo "  - inst_larissap: nome da instância da Larissa"
echo ""

# 3. Instalar PM2 (gerenciador de processos)
echo "[INFO] Instalando PM2..."
npm install -g pm2 --quiet

# 4. Iniciar worker com PM2
echo "[INFO] Iniciando worker..."
cd /root/rise-cron
pm2 stop rise-cron 2>/dev/null || true
pm2 start worker.js --name "rise-cron" --restart-delay=5000

# 5. Salvar PM2 para reiniciar após reboot
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || true

echo ""
echo "======================================================"
echo "  [SUCESSO] Worker instalado e rodando!"
echo "======================================================"
echo ""
echo "  Comandos úteis:"
echo "  pm2 status          → ver status"
echo "  pm2 logs rise-cron  → ver logs em tempo real"
echo "  pm2 restart rise-cron → reiniciar"
echo "  pm2 stop rise-cron  → parar"
echo ""
