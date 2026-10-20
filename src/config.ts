export const DOCK = [
  { id: 'youtube.leanback.v4', title: 'YouTube' },
  { id: 'spotify-beehive', title: 'Spotify' },
  { id: 'org.jellyfin.webos', title: 'Jellyfin' },
  { id: '__more__', title: 'Más apps' },
];

export const INPUTS = [
  { id: 'com.webos.app.hdmi2', title: 'PC', sub: 'HDMI 2' },
  { id: 'com.webos.app.hdmi1', title: 'Switch', sub: 'HDMI 1' },
];

export const KEYS = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461 };

// Teclas numéricas 0..9 (códigos 48..57)
export const NUM_KEY_MIN = 48;
export const NUM_KEY_MAX = 57;

export type Geo = { lat: number; lon: number; tz: string; city: string };

// Ubicación del tiempo. `npm run build` la inyecta desde lghome.config.json (`weather`);
// sin ese fichero (tests, CI) se usan los valores de ejemplo de lghome.config.example.json.
declare const __LGHOME_GEO__: Geo | undefined;
export const DEFAULT_GEO: Geo = { lat: 40.4168, lon: -3.7038, tz: 'Europe/Madrid', city: 'Madrid' };
export const GEO: Geo = typeof __LGHOME_GEO__ !== 'undefined' ? __LGHOME_GEO__ : DEFAULT_GEO;
