// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CACHE_MAX_AGE_MS, fetchForecast, loadWeather, weatherUrl, wmoIcon, wmoText } from '../../src/weather';
import { DEFAULT_GEO, GEO } from '../../src/config';
import { mountWeather } from '../../src/views/weather';

const FIXTURE = JSON.parse(readFileSync('tests/fixtures/open-meteo.json', 'utf8'));
const okFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve(FIXTURE) } as any);
const badFetch = () => Promise.reject(new Error('sin red'));

beforeEach(() => localStorage.clear());

describe('el tiempo', () => {
  it('mapea la respuesta de Open-Meteo', async () => {
    let url = '';
    const f = await fetchForecast(((u: string) => { url = u; return okFetch(); }) as any);
    // Sin build (tests) se usa la ubicación de ejemplo, nunca lghome.config.json.
    expect(GEO).toEqual(DEFAULT_GEO);
    expect(url).toContain('latitude=40.4168&longitude=-3.7038');
    expect(url).toContain('timezone=Europe%2FMadrid');
    expect(url).toContain('forecast_days=5');
    expect(f.now).toEqual({ temp: 14, code: 3, max: 18, min: 12 });
    expect(f.days.length).toBe(4);
    // 2026-10-20 es martes, así que los días van de MIÉ a SÁB
    expect(f.days.map((d) => d.dow)).toEqual(['MIÉ', 'JUE', 'VIE', 'SÁB']);
    expect(f.days[0]).toEqual({ dow: 'MIÉ', code: 3, max: 19, min: 10 });
  });

  it('weatherUrl usa la ubicación que se le pasa', () => {
    const url = weatherUrl({ lat: -33.8688, lon: 151.2093, tz: 'Australia/Sydney', city: 'Sídney' });
    expect(url).toContain('latitude=-33.8688&longitude=151.2093');
    expect(url).toContain('timezone=Australia%2FSydney');
    expect(url).toContain('current_weather=true');
    expect(url).toContain('daily=weathercode,temperature_2m_max,temperature_2m_min');
  });

  it('wmoText en español', () => {
    expect(wmoText(0)).toBe('Despejado');
    expect(wmoText(61)).toBe('Lluvia');
    expect(wmoText(45)).toBe('Niebla');
    expect(wmoText(95)).toBe('Tormenta');
    expect(wmoText(12345)).toBe('');
  });

  it('wmoIcon devuelve un SVG para cualquier código', () => {
    expect(wmoIcon(0)).toContain('<svg');
    expect(wmoIcon(61)).toContain('<svg');
    expect(wmoIcon(12345)).toContain('<svg');
  });

  it('weather falla → usa caché', async () => {
    const first = await loadWeather(okFetch as any, localStorage);
    expect(first).not.toBeNull();
    expect(localStorage.getItem('lghome.weather')).not.toBeNull();
    const second = await loadWeather(badFetch as any, localStorage);
    expect(second).toEqual(first);
  });

  it('sin caché y sin red → null', async () => {
    expect(await loadWeather(badFetch as any, localStorage)).toBeNull();
  });

  it('la vista se oculta sin datos y se muestra con ellos', async () => {
    const hidden = document.createElement('div');
    document.body.appendChild(hidden);
    const a = mountWeather(hidden, badFetch as any, localStorage);
    await new Promise((r) => setTimeout(r, 0));
    expect(hidden.style.display).toBe('none');
    a.stop();

    const shown = document.createElement('div');
    document.body.appendChild(shown);
    const b = mountWeather(shown, okFetch as any, localStorage);
    await new Promise((r) => setTimeout(r, 0));
    expect(shown.style.display).not.toBe('none');
    expect(shown.querySelector('.wx-city')!.textContent).toBe(DEFAULT_GEO.city);
    expect(shown.textContent).toContain('14°');
    expect(shown.querySelectorAll('.wx-day').length).toBe(4);
    b.stop();
  });

  it('caché corrupta, con days que no es array o incompleta → null', async () => {
    for (const raw of ['{roto', JSON.stringify({ savedAt: Date.now(), forecast: { now: { temp: 1, code: 0, max: 1, min: 0 }, days: 'x' } }),
      JSON.stringify({ savedAt: Date.now(), forecast: { now: {}, days: [] } }), JSON.stringify({ now: 1 })]) {
      localStorage.setItem('lghome.weather', raw);
      expect(await loadWeather(badFetch as any, localStorage)).toBeNull();
    }
  });

  it('caché de más de 24 h se ignora', async () => {
    const t0 = 1_000_000_000_000;
    await loadWeather(okFetch as any, localStorage, 15000, () => t0);
    expect(await loadWeather(badFetch as any, localStorage, 15000, () => t0 + CACHE_MAX_AGE_MS - 1)).not.toBeNull();
    expect(await loadWeather(badFetch as any, localStorage, 15000, () => t0 + CACHE_MAX_AGE_MS + 1)).toBeNull();
  });

  it('temperatura null no se pinta como 0° (respuesta no válida → caché/null)', async () => {
    const bad = JSON.parse(JSON.stringify(FIXTURE));
    bad.daily.temperature_2m_max[2] = null;
    const f = () => Promise.resolve({ ok: true, json: () => Promise.resolve(bad) } as any);
    await expect(fetchForecast(f as any)).rejects.toThrow();
    expect(await loadWeather(f as any, localStorage)).toBeNull();
  });

  it('res.ok false → cae a caché/null', async () => {
    const f = () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) } as any);
    expect(await loadWeather(f as any, localStorage)).toBeNull();
  });

  it('storage que lanza no hace rechazar a loadWeather', async () => {
    const boom = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); } };
    expect(await loadWeather(okFetch as any, boom)).not.toBeNull();
    expect(await loadWeather(badFetch as any, boom)).toBeNull();
  });

  it('un fetch que no responde → timeout → caché', async () => {
    await loadWeather(okFetch as any, localStorage);
    const hang = () => new Promise<any>(() => {});
    const r = await loadWeather(hang as any, localStorage, 20);
    expect(r).not.toBeNull();
    localStorage.clear();
    expect(await loadWeather(hang as any, localStorage, 20)).toBeNull();
  });
});

describe('refresco de la vista', () => {
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it('sigue refrescando tras un error y stop() lo detiene', async () => {
    vi.useFakeTimers();
    let calls = 0;
    const f = () => { calls++; return calls === 1 ? Promise.reject(new Error('x')) : okFetch(); };
    const el = document.createElement('div');
    document.body.appendChild(el);
    const v = mountWeather(el, f as any, localStorage);
    await vi.advanceTimersByTimeAsync(10);
    expect(calls).toBe(1);
    expect(el.style.display).toBe('none');
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(calls).toBe(2);
    expect(el.style.display).not.toBe('none');
    v.stop();
    await vi.advanceTimersByTimeAsync(2 * 30 * 60 * 1000);
    expect(calls).toBe(2);
  });

  it('un storage que lanza no rompe la vista', async () => {
    const boom = { getItem() { throw new Error('b'); }, setItem() { throw new Error('b'); } };
    const el = document.createElement('div');
    document.body.appendChild(el);
    const v = mountWeather(el, okFetch as any, boom);
    await new Promise((r) => setTimeout(r, 0));
    expect(el.style.display).not.toBe('none');
    v.stop();
  });
});

describe('tarjeta con texto largo', () => {
  it('la descripción más larga va en .wx-desc (elipsis) y el rango aparte', async () => {
    const longest = [0, 1, 2, 3, 45, 51, 61, 71, 80, 85, 95].map(wmoText).sort((a, b) => b.length - a.length)[0];
    expect(longest).toBe('Parcialmente nuboso');
    const j = JSON.parse(JSON.stringify(FIXTURE));
    j.current_weather.weathercode = 2;
    const f = () => Promise.resolve({ ok: true, json: () => Promise.resolve(j) } as any);
    const el = document.createElement('div');
    document.body.appendChild(el);
    const v = mountWeather(el, f as any, localStorage);
    await new Promise((r) => setTimeout(r, 0));
    expect(el.querySelector('.wx-desc')!.textContent).toBe(longest);
    expect(el.querySelector('.wx-range')!.textContent).toBe('18° / 12°');
    expect(el.querySelector('.wx-now .wx-txt')).not.toBeNull();
    v.stop();
  });
});
