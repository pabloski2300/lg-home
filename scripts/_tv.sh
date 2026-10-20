# Funciones comunes: se carga con `source` desde la raíz del repo.
# Los valores de tu casa (IP y MAC de la TV, clave SSH, URLs...) viven en lghome.config.json,
# que no se sube al repo. Plantilla: lghome.config.example.json.
LGHOME_CONFIG="${LGHOME_CONFIG:-lghome.config.json}"
if [ ! -f "$LGHOME_CONFIG" ]; then
  echo "ERROR: falta $LGHOME_CONFIG con los datos de tu TV." >&2
  echo "Créalo a partir de la plantilla y pon tus valores:" >&2
  echo "  cp lghome.config.example.json lghome.config.json" >&2
  exit 1
fi

# cfg clave.con.puntos -> valor de lghome.config.json (sale con error y mensaje si falta o está vacío).
cfg() {
  node -e '
    const [file, key] = process.argv.slice(1);
    let v;
    try { v = JSON.parse(require("fs").readFileSync(file, "utf8")); }
    catch (e) { console.error("ERROR: " + file + " no es JSON válido: " + e.message); process.exit(1); }
    for (const k of key.split(".")) v = v == null ? undefined : v[k];
    if (v === undefined || v === null || v === "") {
      console.error("ERROR: falta \"" + key + "\" en " + file + " (mira lghome.config.example.json).");
      process.exit(1);
    }
    process.stdout.write(String(v));
  ' "$LGHOME_CONFIG" "$1"
}

TV_IP="${TV_IP:-$(cfg tv.host)}" || exit 1
TV_KEY="${TV_KEY:-$(cfg tv.sshKey)}" || exit 1
TV_KEY="${TV_KEY/#\~/$HOME}"
TV_MAC="${TV_MAC:-$(cfg tv.mac)}" || exit 1
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=accept-new -i "$TV_KEY")

tv() { ssh "${SSH_OPTS[@]}" "root@$TV_IP" "$@"; }

# Wake-on-LAN: difusión general y a la red /24 de la TV.
wake_tv() {
  python -c "import socket;p=b'\xff'*6+bytes.fromhex('${TV_MAC//:/}')*16;s=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);s.setsockopt(socket.SOL_SOCKET,socket.SO_BROADCAST,1);[s.sendto(p,(a,9)) for a in ('255.255.255.255','${TV_IP%.*}.255')]"
}

ensure_tv() {
  if tv true 2>/dev/null; then return 0; fi
  echo "La TV no responde; enviando Wake-on-LAN..."
  wake_tv
  for _ in $(seq 1 15); do
    sleep 5
    if tv true 2>/dev/null; then return 0; fi
  done
  echo "ERROR: la TV ($TV_IP) no responde por SSH tras 75 s." >&2
  exit 1
}
