#!/usr/bin/env bash
# Compila, empaqueta e instala LG Home en la TV, eleva el servicio, lo activa como inicio y lanza la app.
# Uso: bash scripts/deploy.sh [--no-home]   (--no-home: no cambia la tecla Home de la TV)
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_tv.sh

SET_HOME=1
for a in "$@"; do
  case "$a" in
    --no-home) SET_HOME=0 ;;
    *) echo "Uso: $0 [--no-home]" >&2; exit 2 ;;
  esac
done

APP_ID=com.lghome.app
SVC_ID=com.lghome.app.service
VERSION=$(node -p "require('./app/appinfo.json').version")
IPK="dist/${APP_ID}_${VERSION}_all.ipk"
# Valor del salvapantallas de LG antes de la primera activación (lo restaura uninstall.sh).
SS_DIR=/home/root/.config/lg-home
SS_PREV=$SS_DIR/screensaver.prev

npm run build
npm run package
[ -f "$IPK" ] || { echo "ERROR: no existe $IPK" >&2; exit 1; }

ensure_tv
scp "${SSH_OPTS[@]}" "$IPK" "root@$TV_IP:/tmp/lg-home.ipk"

echo "Instalando (puede tardar ~1 min)..."
tv "rm -f /tmp/lg-home-inst.log; (luna-send -w 110000 -i luna://com.webos.appInstallService/dev/install '{\"id\":\"com.ares.defaultName\",\"ipkUrl\":\"/tmp/lg-home.ipk\",\"subscribe\":true}' > /tmp/lg-home-inst.log 2>&1 &)"
ok=0
for _ in $(seq 1 40); do
  sleep 3
  if tv "grep -q '\"state\":\"installed\"' /tmp/lg-home-inst.log" 2>/dev/null; then ok=1; break; fi
  if tv "grep -qE 'FAILED|failed' /tmp/lg-home-inst.log" 2>/dev/null; then break; fi
done
if [ "$ok" != 1 ]; then
  echo "ERROR: la instalación no terminó bien:" >&2
  tv "cat /tmp/lg-home-inst.log" >&2 || true
  exit 1
fi
echo "Instalada."

echo "Elevando el servicio a root..."
tv "/media/developer/apps/usr/palm/services/org.webosbrew.hbchannel.service/elevate-service $SVC_ID" || echo "AVISO: la elevación devolvió error" >&2

echo "Enlazando el hook de arranque..."
tv "chmod +x /media/developer/apps/usr/palm/services/$SVC_ID/hooks/80-lg-home && ln -sf /media/developer/apps/usr/palm/services/$SVC_ID/hooks/80-lg-home /var/lib/webosbrew/init.d/80-lg-home && ls -l /var/lib/webosbrew/init.d/80-lg-home"

echo "Comprobando que el servicio es root..."
sleep 2
tv "(luna-send -n 1 -w 8000 luna://$SVC_ID/status '{}' > /tmp/lg-home-status.log 2>&1 &); sleep 5; cat /tmp/lg-home-status.log" | tee /tmp/lg-home-status.local
if ! grep -q '"root":true' /tmp/lg-home-status.local; then
  echo "ERROR: el servicio no devuelve \"root\":true; la elevación falló." >&2
  exit 1
fi

echo "Lanzando la app..."
tv "(luna-send -n 1 -w 8000 luna://com.webos.applicationManager/launch '{\"id\":\"$APP_ID\"}' > /tmp/lg-home-launch.log 2>&1 &); sleep 3; cat /tmp/lg-home-launch.log"

if [ "$SET_HOME" = 1 ]; then
  echo "Activando LG Home como pantalla de inicio..."
  tv "(luna-send -n 1 -w 8000 luna://$SVC_ID/setHome '{\"enabled\":true}' > /tmp/lg-home-sethome.log 2>&1 &); sleep 4; cat /tmp/lg-home-sethome.log" | tee /tmp/lg-home-sethome.local
  grep -q "\"home\":\"$APP_ID\"" /tmp/lg-home-sethome.local || { echo "ERROR: no se pudo activar LG Home como inicio." >&2; exit 1; }

  # El salvapantallas de LG (qml-runner) se ponía encima de LG Home y gastaba ~50 % de CPU entre él y
  # surface-manager; el modo cuadro lo sustituye. Se guarda el valor previo una sola vez (uninstall.sh lo repone).
  echo "Desactivando el salvapantallas de LG (lo sustituye el modo cuadro)..."
  tv "(luna-send -n 1 -w 8000 luna://com.webos.settingsservice/getSystemSettings '{\"category\":\"general\",\"keys\":[\"screenSaverEnabled\"]}' > /tmp/lg-home-ss0.log 2>&1 &); sleep 3; cat /tmp/lg-home-ss0.log" > /tmp/lg-home-ss0.local || true
  PREV_SS=$(grep -o '"screenSaverEnabled":"[a-z]*"' /tmp/lg-home-ss0.local | cut -d'"' -f4 || true)
  tv "mkdir -p $SS_DIR && [ -f $SS_PREV ] || echo '${PREV_SS:-on}' > $SS_PREV"
  tv "(luna-send -n 1 -w 8000 luna://com.webos.settingsservice/setSystemSettings '{\"category\":\"general\",\"settings\":{\"screenSaverEnabled\":\"off\"}}' > /tmp/lg-home-ss1.log 2>&1 &); sleep 3; cat /tmp/lg-home-ss1.log" > /tmp/lg-home-ss1.local || true
  if grep -q '"returnValue":true' /tmp/lg-home-ss1.local; then
    echo "Salvapantallas de LG desactivado (valor previo: $(tv "cat $SS_PREV"))."
  else
    echo "AVISO: no se pudo desactivar el salvapantallas de LG:" >&2
    cat /tmp/lg-home-ss1.local >&2
  fi
else
  echo "(--no-home) La tecla Home de la TV no se ha tocado."
fi
