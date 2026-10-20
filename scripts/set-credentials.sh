#!/usr/bin/env bash
# Guarda las credenciales de LG Home en la TV sin que pasen por el chat.
# Uso (en una terminal Git Bash del PC):
#   bash scripts/set-credentials.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source scripts/_tv.sh

# URLs y entidad de Spotify: de lghome.config.json (ver lghome.config.example.json).
JF_URL=$(cfg jellyfin.url)
HA_URL=$(cfg ha.url)
SPOTIFY_ENTITY=$(cfg ha.spotifyEntity)
REMOTE=/home/root/.config/lg-home/config.json

read -rsp "Clave API de Jellyfin: " JF_KEY; echo
read -rsp "Token de Home Assistant: " HA_TOKEN; echo

echo "Comprobando Jellyfin..."
USERS=$(printf 'header = "Authorization: MediaBrowser Token=\\"%s\\""\n' "$JF_KEY" | curl -fsS -m 10 -K - "$JF_URL/Users") || { echo "La clave de Jellyfin no funciona."; exit 1; }
# Python de Windows escribe \r\n: se quita el \r de todo lo que vuelve de Python por una tubería.
mapfile -t NAMES < <(printf '%s' "$USERS" | python -c "import json,sys;[print(u['Name']) for u in json.load(sys.stdin)]" | tr -d '\r')
mapfile -t IDS < <(printf '%s' "$USERS" | python -c "import json,sys;[print(u['Id']) for u in json.load(sys.stdin)]" | tr -d '\r')
[ "${#IDS[@]}" -ge 1 ] || { echo "Jellyfin no devuelve ningún usuario; no hay nada que configurar." >&2; exit 1; }
for i in "${!NAMES[@]}"; do echo "  $((i+1))) ${NAMES[$i]}"; done
while true; do
  read -rp "¿Cuál es tu usuario? [1]: " N; N=${N:-1}
  if [[ "$N" =~ ^[0-9]+$ ]] && [ "$((10#$N))" -ge 1 ] && [ "$((10#$N))" -le "${#IDS[@]}" ]; then break; fi
  echo "  Escribe un número entre 1 y ${#IDS[@]}."
done
JF_USER=${IDS[$((10#$N-1))]}

echo "Comprobando Home Assistant..."
STATE=$(printf 'header = "Authorization: Bearer %s"\n' "$HA_TOKEN" | curl -fsS -m 10 -K - "$HA_URL/api/states/$SPOTIFY_ENTITY") || { echo "El token de HA no funciona."; exit 1; }
echo "  Spotify en HA: $(printf '%s' "$STATE" | python -c "import json,sys;print(json.load(sys.stdin)['state'])" | tr -d '\r')"

JF_USER=$(printf '%s' "$JF_USER" | tr -d '\r')
CONFIG=$(JF_URL="$JF_URL" JF_KEY="$JF_KEY" JF_USER="$JF_USER" HA_URL="$HA_URL" HA_TOKEN="$HA_TOKEN" SE="$SPOTIFY_ENTITY" python -c "
import json,os
e=os.environ
print(json.dumps({'jellyfin':{'url':e['JF_URL'],'apiKey':e['JF_KEY'].strip(),'userId':e['JF_USER'].strip()},
                  'ha':{'url':e['HA_URL'],'token':e['HA_TOKEN'].strip(),'spotifyEntity':e['SE']}},indent=2))")

ensure_tv   # despierta la TV con Wake-on-LAN si hace falta
if ! printf '%s\n' "$CONFIG" | ssh "${SSH_OPTS[@]}" "root@$TV_IP" \
  "umask 077; mkdir -p \$(dirname $REMOTE) && cat > $REMOTE && chmod 600 $REMOTE && ls -l $REMOTE"; then
  unset JF_KEY HA_TOKEN CONFIG
  echo "ERROR: no se pudo escribir $REMOTE en la TV ($TV_IP); revisa la red y la clave SSH ($TV_KEY)." >&2
  exit 1
fi
unset JF_KEY HA_TOKEN CONFIG
echo "Hecho: configuración guardada en la TV ($REMOTE)."
echo "Recuerda guardar las dos claves en tu gestor de contraseñas (\"LG Home - Jellyfin API key\" y \"LG Home - HA token\")."
