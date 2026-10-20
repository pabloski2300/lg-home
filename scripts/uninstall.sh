#!/usr/bin/env bash
# Devuelve la TV al inicio de LG y desinstala LG Home.
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_tv.sh

ensure_tv
tv "(luna-send -n 1 -w 8000 luna://com.webos.settingsservice/setSystemSettings '{\"category\":\"general\",\"settings\":{\"defaultApps\":{\"home\":\"com.webos.app.fullhome\"}}}' > /tmp/lg-home-un1.log 2>&1 &); sleep 3; cat /tmp/lg-home-un1.log" || true
# Comprobar que el reinicio del inicio se aplicó ANTES de quitar nada: si no, la tecla Home quedaría apuntando a una app inexistente.
tv "(luna-send -n 1 -w 8000 luna://com.webos.settingsservice/getSystemSettings '{\"category\":\"general\",\"keys\":[\"defaultApps\"]}' > /tmp/lg-home-un0.log 2>&1 &); sleep 3; cat /tmp/lg-home-un0.log" > "${TMPDIR:-/tmp}/lg-home-un0.local" || true
if ! grep -Eq '"home" *: *"com.webos.app.fullhome"' "${TMPDIR:-/tmp}/lg-home-un0.local"; then
  echo "ERROR: no se pudo devolver el inicio a LG (defaultApps.home sigue sin ser com.webos.app.fullhome)." >&2
  echo "No se ha desinstalado nada para no dejar la tecla Home sin salida. Respuesta de la TV:" >&2
  cat "${TMPDIR:-/tmp}/lg-home-un0.local" >&2
  exit 1
fi
echo "Inicio de LG restaurado."
# Salvapantallas de LG: deploy.sh lo apagó y guardó el valor previo; si no hay registro, se deja encendido (valor de fábrica).
SS_PREV=/home/root/.config/lg-home/screensaver.prev
PREV_SS=$(tv "cat $SS_PREV 2>/dev/null" | tr -dc 'a-z' || true)
case "$PREV_SS" in on|off) ;; *) PREV_SS=on ;; esac
tv "(luna-send -n 1 -w 8000 luna://com.webos.settingsservice/setSystemSettings '{\"category\":\"general\",\"settings\":{\"screenSaverEnabled\":\"$PREV_SS\"}}' > /tmp/lg-home-un3.log 2>&1 &); sleep 3; cat /tmp/lg-home-un3.log" > "${TMPDIR:-/tmp}/lg-home-un3.local" || true
if grep -q '"returnValue":true' "${TMPDIR:-/tmp}/lg-home-un3.local"; then
  echo "Salvapantallas de LG restaurado ($PREV_SS)."
  tv "rm -f $SS_PREV"
else
  echo "AVISO: no se pudo restaurar el salvapantallas de LG (screenSaverEnabled=$PREV_SS). Respuesta:" >&2
  cat "${TMPDIR:-/tmp}/lg-home-un3.local" >&2
fi
tv "rm -f /var/lib/webosbrew/init.d/80-lg-home"
tv "(luna-send -n 1 -w 30000 luna://com.webos.appInstallService/dev/remove '{\"id\":\"com.lghome.app\"}' > /tmp/lg-home-un2.log 2>&1 &); sleep 8; cat /tmp/lg-home-un2.log"
