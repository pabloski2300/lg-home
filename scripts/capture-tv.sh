#!/usr/bin/env bash
# Captura la interfaz de la TV (1920x1080, PNG) y la guarda en la ruta indicada.
# Uso: scripts/capture-tv.sh salida.png
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_tv.sh
OUT="${1:?Uso: scripts/capture-tv.sh salida.png}"
ensure_tv
tv "rm -f /tmp/lg-home-cap.png; (luna-send -n 1 -w 8000 luna://com.webos.service.capture/executeOneShot '{\"path\":\"/tmp/lg-home-cap.png\",\"method\":\"DISPLAY\",\"format\":\"PNG\",\"width\":1920,\"height\":1080}' > /tmp/lg-home-cap.log 2>&1 &); sleep 3; cat /tmp/lg-home-cap.log" 2>/dev/null | grep -q '"returnValue":true' \
  || { echo "ERROR: la captura falló en la TV." >&2; exit 1; }
scp "${SSH_OPTS[@]}" "root@$TV_IP:/tmp/lg-home-cap.png" "$OUT" 2>/dev/null
echo "Captura guardada en $OUT"
