# LG Home

Pantalla de inicio propia para una TV LG con webOS 5 y root (probada en una 55NANO796NE): reloj, el tiempo,
«Seguir viendo» de Jellyfin, «Qué suena» de Spotify (vía Home Assistant), dock con YouTube, Spotify, Jellyfin y
«Más apps» (rejilla de todas las apps), accesos a las entradas HDMI (PC y Switch), ajustes, modo cuadro (fondo + hora)
y música ambiente. Es una app web (Chrome 68) más un servicio webOS (Node 8) en un único IPK, `com.lghome.app`.

La idea de sustituir el inicio de LG viene de [gprot42/webos-launch-home](https://github.com/gprot42/webos-launch-home),
que sirvió de referencia visual y técnica.

## Requisitos
- TV LG webOS 5 con root y el [Homebrew Channel](https://github.com/webosbrew/webos-homebrew-channel) (HBC):
  hace falta `elevate-service` para que el servicio corra como root, y SSH como `root` (puerto 22) con clave.
- En el PC: Node 22 + npm, Git Bash (en Windows), `curl` y Python (para Wake-on-LAN y `set-credentials.sh`).
- Opcionales: Jellyfin y Home Assistant con la integración de Spotify. Sin ellos esas filas se ocultan.

## Puesta en marcha
1. Copia la plantilla de configuración y pon tus valores:

       cp lghome.config.example.json lghome.config.json

   | Clave | Qué es |
   |---|---|
   | `tv.host` | IP de la TV en tu red |
   | `tv.mac` | MAC de la TV (para Wake-on-LAN) |
   | `tv.sshKey` | Clave SSH con acceso `root@<tv.host>` |
   | `weather.lat`, `weather.lon`, `weather.tz`, `weather.city` | Ubicación del tiempo (Open-Meteo, sin clave) y nombre que se muestra |
   | `jellyfin.url` | URL de tu Jellyfin |
   | `ha.url`, `ha.spotifyEntity` | URL de Home Assistant y entidad `media_player` de Spotify |

   `lghome.config.json` no se sube al repo (está en `.gitignore`). Los scripts fallan con un mensaje claro si falta.
   El build lo lee para el tiempo; si no existe, usa los valores de la plantilla.
2. Instala dependencias y comprueba que todo pasa:

       npm install
       npm test

3. Instala en la TV: `bash scripts/deploy.sh`.
4. Guarda las credenciales de Jellyfin y Home Assistant en la TV: `bash scripts/set-credentials.sh`.

## Compilar y probar
    npm install
    npm test                # tests (vitest)
    npm run typecheck       # tsc
    npm run build           # dist/ipk-root (esbuild, target chrome68)
    npx es-check es2017 dist/ipk-root/app/main.js
    npm run package         # dist/com.lghome.app_<versión>_all.ipk
    node scripts/shot.mjs   # capturas de la interfaz en el PC con la TV simulada (ver cabecera del script)

## Desplegar
    bash scripts/deploy.sh             # compila, instala, eleva el servicio, enlaza el hook de arranque,
                                       # lanza la app y deja LG Home como pantalla de inicio (tecla Home)
    bash scripts/deploy.sh --no-home   # igual, pero sin tocar la tecla Home ni el salvapantallas

Al activar LG Home, `deploy.sh` también apaga el salvapantallas de LG (`screenSaverEnabled` = `off`, categoría
`general` de settingsservice): se ponía encima de LG Home y gastaba ~50 % de CPU entre él y surface-manager, y el
modo cuadro ya hace ese papel. El valor anterior se guarda una sola vez en la TV
(`/home/root/.config/lg-home/screensaver.prev`) y `uninstall.sh` lo repone (`on` si no hay registro).
El salvapantallas de «sin señal» (`noSignalScreenSaver`) no se toca.

Si la TV no responde por SSH, los scripts le mandan Wake-on-LAN (a `tv.mac`) y esperan hasta 75 s.

## Desinstalar / volver a la pantalla de LG
- Desde la propia pantalla: ajustes -> «Volver a la pantalla de LG» (`defaultApps.home` pasa a `com.webos.app.fullhome`;
  `bash scripts/deploy.sh` lo vuelve a activar).
- Por SSH (cambia `<ip-de-la-tv>`):

      ssh -i ~/.ssh/id_ed25519_tv root@<ip-de-la-tv> "luna-send -n 1 luna://com.webos.settingsservice/setSystemSettings '{\"category\":\"general\",\"settings\":{\"defaultApps\":{\"home\":\"com.webos.app.fullhome\"}}}'"

- Desinstalar del todo: `bash scripts/uninstall.sh` (restaura el inicio de LG y el salvapantallas de LG, quita el hook de arranque y la app).
- Volver a encender a mano el salvapantallas de LG:

      ssh -i ~/.ssh/id_ed25519_tv root@<ip-de-la-tv> "luna-send -n 1 luna://com.webos.settingsservice/setSystemSettings '{\"category\":\"general\",\"settings\":{\"screenSaverEnabled\":\"on\"}}'"

## Credenciales
Solo viven en la TV, en `/home/root/.config/lg-home/config.json` (permisos 600, fuera del paquete; ejemplo con valores
vacíos en `service/config.example.json`). Nunca se guardan en el repo ni en logs.
`bash scripts/set-credentials.sh` las pide por teclado (sin eco), comprueba que la clave de Jellyfin y el token de
Home Assistant funcionan (con `jellyfin.url`, `ha.url` y `ha.spotifyEntity` de `lghome.config.json`), elige tu usuario
de Jellyfin y escribe el fichero en la TV con `umask 077` + `chmod 600`. No guarda nada en el PC.
Guarda una copia de la clave API de Jellyfin y del token de HA en tu gestor de contraseñas.
Las versiones recientes de Jellyfin exigen la cabecera `Authorization: MediaBrowser Token="..."` (ya la usa el servicio).

## Parámetros de lanzamiento (solo desarrollo)
Se pasan con `launch` y valen para pruebas o capturas:

    luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.lghome.app","params":{"open":"apps"}}'
    luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.lghome.app","params":{"open":"settings"}}'
    luna-send -n 1 luna://com.webos.applicationManager/launch '{"id":"com.lghome.app","params":{"pictureAfterMin":0.2}}'

- `open`: `apps` (rejilla de apps) o `settings` (ajustes).
- `pictureAfterMin`: minutos sin teclas hasta el modo cuadro (mínimo 0,05 = 3 s); sustituye al ajuste hasta el siguiente arranque.
  Tras 12 s sin teclas entra en modo cuadro: se desvanece todo menos el fondo y la hora; la primera tecla solo despierta.

## Cambiar fondos y música
Los ficheros están en `app/assets/bg/` (`NN.jpg` 1920x1080 + miniatura `NN-s.jpg` de 48x27 desenfocada) y
`app/assets/music/` (`01.mp3`..`03.mp3`, lista en `src/music.ts`, `MUSIC_TRACKS`). Anota autor y licencia de cada recurso
nuevo en `app/assets/ASSETS.md` (hoy: fotos Unsplash License, música CC0, fuente Inter OFL, iconos propios). Después, `bash scripts/deploy.sh`.

## Limitaciones conocidas
- Jellyfin: «Seguir viendo» abre la app de Jellyfin, no el episodio (el contenedor `org.jellyfin.webos` ignora los parámetros).
- Las capturas de la TV (`scripts/capture-tv.sh`) no recogen menús del sistema ni vídeo HDMI; los menús de LG no se pueden comprobar así.
- Pulsación larga de Home: la gestiona el sistema (p. ej. menú de ajustes rápidos) y no pasa por LG Home. Como sustituto, Atrás con el foco en el dock abre la última app lanzada desde LG Home.
- Si el servicio se queda sin root o no responde (tras actualizar firmware, por ejemplo), la rejilla de apps, el volumen y «Volver a la pantalla de LG» no funcionan, y además desaparecen «Seguir viendo» y «Qué suena» (los datos pasan por el servicio).

## Solución de problemas
- **`falta lghome.config.json`**: `cp lghome.config.example.json lghome.config.json` y rellena tus valores.
- **La TV no responde por SSH**: está dormida. Wake-on-LAN (lo hacen los scripts solos) y reintentar a los 15-20 s.
- **El servicio no es root** (`status` no devuelve `"root":true`): volver a ejecutar `bash scripts/deploy.sh`, que repite `elevate-service`.
- **El volumen muestra «–»**: el servicio aún arrancaba; la app reintenta sola (2 s, 5 s, 10 s y luego cada 30 s) hasta tener dato.
- **Faltan «Seguir viendo» o «Qué suena»**: revisar `config.json` (`bash scripts/set-credentials.sh`) y que Jellyfin/HA estén accesibles; sin ellos la pantalla sigue entera sin esas filas.
- **Al arrancar no sale LG Home**: log del hook en `/tmp/lg-home-boot.log` y enlace `/var/lib/webosbrew/init.d/80-lg-home`.

## Licencia
[MIT](LICENSE). Créditos y licencias de fondos, música, fuente e iconos en [`app/assets/ASSETS.md`](app/assets/ASSETS.md).
