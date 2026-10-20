# Recursos incluidos en LG Home

## Fondos (`bg/`)

Fotos de [Unsplash](https://unsplash.com), con la [Unsplash License](https://unsplash.com/license)
(uso libre, también comercial, sin atribución obligatoria; la dejamos igualmente).
Descargadas de `images.unsplash.com/photo-<id>?fm=jpg&w=1920&h=1080&fit=crop&q=80` y
recomprimidas a JPEG 1920×1080 ≤ 350 KB. Cada una tiene una miniatura `NN-s.jpg` (48×27,
desenfocada) que el «cristal» amplía a pantalla completa.

| Fichero | Foto | Autor | Página |
|---|---|---|---|
| `01.jpg` | Lago di Braies (Pragser Wildsee), Dolomitas | Pietro De Grandi | https://unsplash.com/photos/T7K4aEPoGGk |
| `02.jpg` | Picos sobre un mar de nubes al atardecer | Sam Ferrara | https://unsplash.com/photos/1527pjeb6jg |
| `03.jpg` | Cumbre con niebla y prados verdes | v2osk | https://unsplash.com/photos/1Z2niiBPg5A |
| `04.jpg` | Río del valle de Yosemite con luz baja | Bailey Zindel | https://unsplash.com/photos/NRQV-hBF10M |
| `05.jpg` | Silueta de acantilado al atardecer sobre el mar | Gontran Isnard | https://unsplash.com/photos/wr8VZnLX00A |
| `06.jpg` | Valle con montañas nevadas y bosque | Kalen Emsley | https://unsplash.com/photos/Bkci_8qcdvQ |

## Fuente (`fonts/`)

Inter 4.1 de [rsms/inter](https://github.com/rsms/inter/releases/tag/v4.1) (`web/Inter-ExtraLight.woff2`,
`Inter-Regular.woff2`, `Inter-SemiBold.woff2` → pesos 200, 400 y 600), recortada con
`pyftsubset` a latín básico + Latin-1 + puntuación general (≈28 KB cada una).
Licencia: SIL Open Font License 1.1, copiada en `fonts/LICENSE-Inter.txt`.

## Iconos (`icons/`)

SVG dibujados para este proyecto (sin copiar ficheros de las marcas): `youtube.svg`,
`spotify.svg`, `jellyfin.svg` (evocan la marca de cada app para reconocerlas desde el sofá),
`more.svg` (cuadrícula de «Más apps»), `pc.svg` y `switch.svg` (glifos de las píldoras).
YouTube, Spotify, Jellyfin y Nintendo Switch son marcas de sus dueños; se usan solo para
identificar la app en esta pantalla de inicio personal. Cuando llegue `listApps` (Task 8),
el dock usará el `largeIcon` del sistema y estos SVG quedarán de respaldo.

## Música ambiente (`music/`)

Tres pistas de **TRG Banks**, dedicadas al dominio público con
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) (licencia comprobada en la página de
cada fichero de Wikimedia Commons, campo «License: CC0», origen Free Music Archive). FreePD.com
(la fuente inicialmente prevista) cerró en 2025, por eso se usa Commons. Recodificadas de OGG a
MP3 128 kbps CBR, recortadas a 4:00 con 4 s de fundido final (≈3,8 MB cada una), sin metadatos.

| Fichero | Pista | Autor | Página |
|---|---|---|---|
| `01.mp3` | Into the sunset | TRG Banks | https://commons.wikimedia.org/wiki/File:TRG_Banks_-_19_-_Into_the_sunset.ogg |
| `02.mp3` | Twilight valley | TRG Banks | https://commons.wikimedia.org/wiki/File:TRG_Banks_-_17_-_Twilight_valley.ogg |
| `03.mp3` | Coast | TRG Banks | https://commons.wikimedia.org/wiki/File:TRG_Banks_-_15_-_Coast.ogg |
