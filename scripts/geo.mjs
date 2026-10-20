// Ubicación del tiempo para el build: `weather` de lghome.config.json, o de la plantilla
// lghome.config.example.json si no existe el fichero local (tests, CI, primer clon).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readGeo(root, file = process.env.LGHOME_CONFIG) {
  const local = file ? join(root, file) : join(root, 'lghome.config.json');
  const path = existsSync(local) ? local : join(root, 'lghome.config.example.json');
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`${path} no es JSON válido: ${e.message}`);
  }
  const w = (cfg && cfg.weather) || {};
  const geo = { lat: Number(w.lat), lon: Number(w.lon), tz: String(w.tz || ''), city: String(w.city || '') };
  if (!isFinite(geo.lat) || !isFinite(geo.lon) || w.lat === undefined || w.lon === undefined || !geo.tz || !geo.city) {
    throw new Error(`${path}: "weather" necesita lat, lon, tz y city (mira lghome.config.example.json).`);
  }
  return { geo, path };
}
