import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-ignore: módulo .mjs del build, sin tipos
import { readGeo } from '../scripts/geo.mjs';

const EXAMPLE = readFileSync(resolve(__dirname, '..', 'lghome.config.example.json'), 'utf8');

function repo(local?: object): string {
  const d = mkdtempSync(join(tmpdir(), 'lghome-geo-'));
  writeFileSync(join(d, 'lghome.config.example.json'), EXAMPLE);
  if (local) writeFileSync(join(d, 'lghome.config.json'), JSON.stringify(local));
  return d;
}

describe('ubicación del tiempo en el build', () => {
  it('sin lghome.config.json usa la plantilla de ejemplo', () => {
    const { geo, path } = readGeo(repo(), '');
    expect(geo).toEqual({ lat: 40.4168, lon: -3.7038, tz: 'Europe/Madrid', city: 'Madrid' });
    expect(path).toMatch(/lghome\.config\.example\.json$/);
  });

  it('con lghome.config.json usa sus valores', () => {
    const d = repo({ weather: { lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris', city: 'París' } });
    expect(readGeo(d, '').geo).toEqual({ lat: 48.8566, lon: 2.3522, tz: 'Europe/Paris', city: 'París' });
  });

  it('weather incompleto falla con un mensaje claro', () => {
    const d = repo({ weather: { lat: 1, tz: 'UTC', city: 'X' } });
    expect(() => readGeo(d, '')).toThrow(/lat, lon, tz y city/);
  });
});
