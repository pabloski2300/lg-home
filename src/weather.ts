// El tiempo de la ciudad configurada (Open-Meteo, sin clave). Todo en español y sin Intl:
// Chrome 68 en la TV puede no traer datos de 'es'.
import { GEO, Geo } from './config';

export type Forecast = {
  now: { temp: number; code: number; max: number; min: number };
  days: { dow: string; code: number; max: number; min: number }[];
};

export function weatherUrl(geo: Geo): string {
  return 'https://api.open-meteo.com/v1/forecast?latitude=' + geo.lat + '&longitude=' + geo.lon +
    '&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min' +
    '&timezone=' + encodeURIComponent(geo.tz) + '&forecast_days=5';
}

export const WEATHER_URL = weatherUrl(GEO);
const CACHE_KEY = 'lghome.weather';
const DOW = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

type FetchFn = (url: string) => Promise<{ ok: boolean; json(): Promise<any> }>;
type Store = Pick<Storage, 'getItem' | 'setItem'>;

export const FETCH_TIMEOUT_MS = 15000;
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function dowOf(iso: string): string {
  const p = iso.split('-');
  return DOW[new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()];
}

function num(v: any): number {
  if (typeof v !== 'number' || !isFinite(v)) throw new Error('Dato numérico no válido');
  return Math.round(v);
}

/** Sin AbortController en Chrome 68: la petición se deja correr pero deja de esperarse. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('Tiempo de espera agotado')), ms);
    p.then((v) => { window.clearTimeout(t); resolve(v); }, (e) => { window.clearTimeout(t); reject(e); });
  });
}

export async function fetchForecast(fetchFn: FetchFn = (u) => fetch(u), timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Forecast> {
  const res = await withTimeout(
    (async () => {
      const r = await fetchFn(WEATHER_URL);
      if (!r.ok) throw new Error('Open-Meteo respondió con error');
      return r.json();
    })(),
    timeoutMs,
  );
  const j = res;
  const d = j && j.daily;
  const cur = j && j.current_weather;
  if (!d || !cur || !Array.isArray(d.time) || d.time.length < 5) throw new Error('Respuesta de Open-Meteo no válida');
  const days: Forecast['days'] = [];
  for (let i = 1; i < 5; i++) {
    days.push({
      dow: dowOf(String(d.time[i])),
      code: num(d.weathercode[i]),
      max: num(d.temperature_2m_max[i]),
      min: num(d.temperature_2m_min[i]),
    });
  }
  return {
    now: { temp: num(cur.temperature), code: num(cur.weathercode), max: num(d.temperature_2m_max[0]), min: num(d.temperature_2m_min[0]) },
    days,
  };
}

function isFiniteNum(v: any): boolean { return typeof v === 'number' && isFinite(v); }

export function isForecast(p: any): p is Forecast {
  if (!p || !p.now || !Array.isArray(p.days) || p.days.length !== 4) return false;
  const n = p.now;
  if (!isFiniteNum(n.temp) || !isFiniteNum(n.code) || !isFiniteNum(n.max) || !isFiniteNum(n.min)) return false;
  for (let i = 0; i < 4; i++) {
    const d = p.days[i];
    if (!d || typeof d.dow !== 'string' || !isFiniteNum(d.code) || !isFiniteNum(d.max) || !isFiniteNum(d.min)) return false;
  }
  return true;
}

/** Datos frescos si hay red; si falla, la última copia guardada (máx. 24 h); si no hay, null. Nunca rechaza. */
export async function loadWeather(
  fetchFn?: FetchFn,
  storage?: Store,
  timeoutMs: number = FETCH_TIMEOUT_MS,
  now: () => number = () => Date.now(),
): Promise<Forecast | null> {
  let store: Store | null = null;
  try { store = storage || localStorage; } catch (e) { store = null; }
  try {
    const f = await fetchForecast(fetchFn, timeoutMs);
    try { if (store) store.setItem(CACHE_KEY, JSON.stringify({ savedAt: now(), forecast: f })); } catch (e) { /* sin almacenamiento */ }
    return f;
  } catch (e) {
    try {
      const raw = store ? store.getItem(CACHE_KEY) : null;
      if (raw) {
        const p = JSON.parse(raw);
        if (p && isFiniteNum(p.savedAt) && now() - p.savedAt < CACHE_MAX_AGE_MS && isForecast(p.forecast)) return p.forecast;
      }
    } catch (e2) { /* caché rota */ }
    return null;
  }
}

export function wmoText(code: number): string {
  if (code === 0) return 'Despejado';
  if (code === 1) return 'Poco nuboso';
  if (code === 2) return 'Parcialmente nuboso';
  if (code === 3) return 'Nublado';
  if (code === 45 || code === 48) return 'Niebla';
  if (code >= 51 && code <= 57) return 'Llovizna';
  if (code >= 61 && code <= 67) return 'Lluvia';
  if (code >= 71 && code <= 77) return 'Nieve';
  if (code >= 80 && code <= 82) return 'Chubascos';
  if (code === 85 || code === 86) return 'Chubascos de nieve';
  if (code >= 95 && code <= 99) return 'Tormenta';
  return '';
}

const SVG = (body: string) =>
  '<svg class="wx-ic" viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="#fff" ' +
  'stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' + body + '</svg>';
const CLOUD = '<path d="M14 36h19a7 7 0 0 0 .8-13.95A10 10 0 0 0 14.4 20 8 8 0 0 0 14 36z"/>';
const CLOUD_HI = '<path d="M13 38h20a7 7 0 0 0 .8-13.95A10 10 0 0 0 13.4 22 8 8 0 0 0 13 38z"/>';
const SUN_RAYS = '<path d="M24 4v5M24 39v5M4 24h5M39 24h5M9.9 9.9l3.5 3.5M34.6 34.6l3.5 3.5M9.9 38.1l3.5-3.5M34.6 13.4l3.5-3.5"/>';

const ICONS: { [k: string]: string } = {
  sun: SVG('<circle cx="24" cy="24" r="8"/>' + SUN_RAYS),
  partly: SVG('<circle cx="17" cy="17" r="6"/><path d="M17 4v3M5 17h3M8.5 8.5l2 2M25.5 8.5l-2 2"/>' +
    '<path d="M18 40h18a6.5 6.5 0 0 0 .7-12.95A9 9 0 0 0 19.3 25.5 7.2 7.2 0 0 0 18 40z"/>'),
  cloud: SVG(CLOUD),
  fog: SVG('<path d="M14 26h19a7 7 0 0 0 .8-13.95A10 10 0 0 0 14.4 10 8 8 0 0 0 14 26z"/><path d="M8 33h32M12 40h24"/>'),
  drizzle: SVG(CLOUD + '<path d="M17 41v2M24 41v2M31 41v2"/>'),
  rain: SVG(CLOUD + '<path d="M16 40l-2 5M24 40l-2 5M32 40l-2 5"/>'),
  snow: SVG(CLOUD + '<path d="M16 41v.1M24 41v.1M32 41v.1M20 45v.1M28 45v.1"/>'),
  storm: SVG(CLOUD_HI + '<path d="M25 33l-5 7h6l-3 6"/>'),
};

export function wmoIcon(code: number): string {
  let k = 'cloud';
  if (code === 0) k = 'sun';
  else if (code === 1 || code === 2) k = 'partly';
  else if (code === 45 || code === 48) k = 'fog';
  else if (code >= 51 && code <= 57) k = 'drizzle';
  else if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) k = 'rain';
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) k = 'snow';
  else if (code >= 95 && code <= 99) k = 'storm';
  return ICONS[k];
}
