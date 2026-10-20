// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const order: string[] = [];
let svcCalls: { [m: string]: number } = {};
/** Respuesta de «Qué suena»; algunos tests la cambian (Spotify sonando, retrasos, sin respuesta). */
let npReply: () => Promise<any> = () => Promise.resolve({ playing: false });
vi.mock('../../src/luna', () => ({
  launchApp: (id: string) => { order.push('launch:' + id); return Promise.resolve(); },
  call: () => Promise.reject(new Error('sin bridge')),
  svc: (method: string) => {
    svcCalls[method] = (svcCalls[method] || 0) + 1;
    if (method === 'nowPlaying') return npReply();
    if (method === 'volume') return Promise.resolve({ volume: 10, muted: false });
    if (method === 'resume') return Promise.resolve({ items: [] });
    return Promise.resolve({});
  },
}));

import { applySettings, boot, MUSIC_GATE_MS, onKey, PICTURE_FADE_MS } from '../../src/main';
import { NOWPLAYING_POLL_MS } from '../../src/views/nowplaying';
import { ROTATE_MS } from '../../src/views/scene';

const MIN = 60000;
let paused = true;
let hidden = false;
let audioCreated = 0;
let lastAudio: HTMLAudioElement | null = null;

/** jsdom no carga imágenes: esta imitación dispara onload en el siguiente tic. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_v: string) { setTimeout(() => { if (this.onload) this.onload(); }, 0); }
}

function key(code: number): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => code });
  return e;
}
const root = () => document.getElementById('root')!;
const inPicture = () => root().classList.contains('picture');
const focusedTile = () => {
  const t = document.querySelectorAll('.dock-el .tile');
  for (let i = 0; i < t.length; i++) if (t[i].className.indexOf('focused') >= 0) return i;
  return -1;
};
const relaunch = () => document.dispatchEvent(new CustomEvent('webOSRelaunch', { detail: {} }));
function setHidden(h: boolean): void {
  hidden = h;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 20, 21, 47, 5));
  order.length = 0;
  svcCalls = {};
  npReply = () => Promise.resolve({ playing: false });
  paused = true;
  hidden = false;
  audioCreated = 0;
  localStorage.clear();
  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('fetch', () => Promise.reject(new Error('sin red')));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLAudioElement) { lastAudio = this; paused = false; order.push('play'); return Promise.resolve(); });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () { paused = true; order.push('pause'); });
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get: () => paused });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  const ce = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string, o?: any) => {
    if (String(tag).toLowerCase() === 'audio') audioCreated++;
    return ce(tag, o);
  }) as any);
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => {
  hidden = false;
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('modo cuadro', () => {
  it('entra en reposo tras pictureAfterMin (3 min por defecto)', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(3 * MIN - 1000);
    expect(inPicture()).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(inPicture()).toBe(true);
    expect(PICTURE_FADE_MS).toBe(600);
  });

  it('respeta pictureAfterMin de los ajustes', async () => {
    localStorage.setItem('lghome.settings', JSON.stringify({ pictureAfterMin: 10 }));
    boot(root());
    await vi.advanceTimersByTimeAsync(9 * MIN);
    expect(inPicture()).toBe(false);
    await vi.advanceTimersByTimeAsync(MIN);
    expect(inPicture()).toBe(true);
  });

  it('la primera tecla en reposo solo despierta: número, OK y Atrás no lanzan nada', async () => {
    boot(root());
    for (const k of [49, 13, 461, 39]) {
      await vi.advanceTimersByTimeAsync(3 * MIN);
      expect(inPicture()).toBe(true);
      const e = key(k);
      onKey(e);
      expect(e.defaultPrevented).toBe(true);
      expect(inPicture()).toBe(false);
    }
    expect(order.filter((x) => x.indexOf('launch:') === 0)).toEqual([]);
    expect(focusedTile()).toBe(0); // la flecha tampoco movió el foco
    // despierto, la tecla vuelve a funcionar
    onKey(key(39));
    expect(focusedTile()).toBe(1);
  });

  it('una tecla normal reinicia la cuenta', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(2 * MIN);
    onKey(key(39));
    await vi.advanceTimersByTimeAsync(2 * MIN);
    expect(inPicture()).toBe(false);
    await vi.advanceTimersByTimeAsync(MIN);
    expect(inPicture()).toBe(true);
  });

  it('pictureMode desactivado → nunca entra en reposo', async () => {
    localStorage.setItem('lghome.settings', JSON.stringify({ pictureMode: false }));
    boot(root());
    await vi.advanceTimersByTimeAsync(120 * MIN);
    expect(inPicture()).toBe(false);
  });

  it('en modo cuadro la música baja (quiet) y vuelve al despertar', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(2000);
    const audio = () => lastAudio as HTMLAudioElement;
    expect(paused).toBe(false);
    expect(audio().volume).toBeCloseTo(0.25, 2);
    await vi.advanceTimersByTimeAsync(3 * MIN + 2000);
    expect(audio().volume).toBeCloseTo(0.08, 2);
    onKey(key(13));
    await vi.advanceTimersByTimeAsync(2000);
    expect(audio().volume).toBeCloseTo(0.25, 2);
  });
});

describe('ciclo de vida', () => {
  it('relaunch no duplica timers (tres webOSRelaunch seguidos)', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(2000);
    relaunch();
    await vi.advanceTimersByTimeAsync(2000);
    const timers = vi.getTimerCount();

    onKey(key(38)); // foco fuera del dock
    await vi.advanceTimersByTimeAsync(3 * MIN);
    expect(inPicture()).toBe(true);
    const audios = audioCreated;
    relaunch(); relaunch(); relaunch();
    await vi.advanceTimersByTimeAsync(2000);

    expect(vi.getTimerCount()).toBe(timers);
    expect(inPicture()).toBe(false);
    expect(focusedTile()).toBe(0);
    expect(audioCreated).toBe(audios); // ningún <audio> nuevo
    expect(audioCreated).toBeLessThanOrEqual(1);
    // un solo intervalo de «Qué suena»
    const np = svcCalls.nowPlaying;
    await vi.advanceTimersByTimeAsync(NOWPLAYING_POLL_MS);
    expect(svcCalls.nowPlaying).toBe(np + 1);
    // un solo temporizador de reposo: vuelve al modo cuadro una vez, a los 3 min del relaunch
    await vi.advanceTimersByTimeAsync(3 * MIN - NOWPLAYING_POLL_MS - 2000 - 1);
    expect(inPicture()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(inPicture()).toBe(true);
    // un solo keydown: una flecha despierta, la siguiente mueve una sola posición
    document.dispatchEvent(key(39));
    document.dispatchEvent(key(39));
    expect(focusedTile()).toBe(1);
  });

  it('relaunch refresca «Seguir viendo» y «Qué suena»', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(2000);
    const r = svcCalls.resume;
    const np = svcCalls.nowPlaying;
    relaunch();
    await vi.advanceTimersByTimeAsync(0);
    expect(svcCalls.resume).toBe(r + 1);
    expect(svcCalls.nowPlaying).toBe(np + 1);
  });

  it('boot() dos veces no apila oyentes ni temporizadores', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(2000);
    const timers = vi.getTimerCount();
    document.body.innerHTML = '<div id="root"></div>';
    boot(root());
    await vi.advanceTimersByTimeAsync(2000);
    expect(vi.getTimerCount()).toBe(timers);
    expect(audioCreated).toBeLessThanOrEqual(1);
    document.dispatchEvent(key(39));
    expect(focusedTile()).toBe(1);
    const removed = vi.spyOn(window, 'removeEventListener');
    boot(root());
    expect(removed.mock.calls.some((c) => c[0] === 'load')).toBe(true);
  });

  it('oculta → para música, sondeos y temporizadores y suelta los fondos no visibles', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(2000);
    expect(paused).toBe(false);
    expect(document.querySelectorAll('.bg').length).toBe(1);
    // entra la foto siguiente: durante el fundido hay dos capas
    await vi.advanceTimersByTimeAsync(ROTATE_MS - 2000 + 10);
    expect(document.querySelectorAll('.bg').length).toBe(2);
    const newest = document.querySelectorAll('.bg')[1];

    setHidden(true);
    expect(paused).toBe(true); // síncrono
    const bgs = document.querySelectorAll('.bg');
    expect(bgs.length).toBe(1);
    expect(bgs[0]).toBe(newest);

    const np = svcCalls.nowPlaying;
    const plays = order.filter((x) => x === 'play').length;
    await vi.advanceTimersByTimeAsync(2 * ROTATE_MS);
    expect(svcCalls.nowPlaying).toBe(np); // sin sondeos
    expect(inPicture()).toBe(false); // sin temporizador de reposo
    expect(order.filter((x) => x === 'play').length).toBe(plays); // el tic de música no la rearranca
    expect(document.querySelectorAll('.bg').length).toBe(1); // ni rota el fondo
  });

  it('visible otra vez → los reanuda (reloj al momento, sondeos, reposo, música)', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(2000);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(10 * MIN);
    vi.setSystemTime(new Date(2026, 9, 20, 23, 5, 30)); // el reloj del motor salta (TV en segundo plano)
    const r = svcCalls.resume;
    const np = svcCalls.nowPlaying;

    setHidden(false);
    expect(document.querySelector('.clock-time')!.textContent).toBe('23:05');
    await vi.advanceTimersByTimeAsync(0);
    expect(svcCalls.resume).toBe(r + 1);
    expect(svcCalls.nowPlaying).toBe(np + 1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(paused).toBe(false);
    await vi.advanceTimersByTimeAsync(NOWPLAYING_POLL_MS);
    expect(svcCalls.nowPlaying).toBe(np + 2);
    await vi.advanceTimersByTimeAsync(3 * MIN);
    expect(inPicture()).toBe(true);
  });

  it('arranca oculta (como en webOS) y al mostrarse carga el fondo y lo pone todo en marcha', async () => {
    hidden = true;
    boot(root());
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(svcCalls.nowPlaying || 0).toBe(0);
    expect(inPicture()).toBe(false);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(10);
    expect(document.querySelectorAll('.bg').length).toBe(1);
    expect(svcCalls.nowPlaying).toBe(1);
    expect(svcCalls.resume).toBe(1);
    await vi.advanceTimersByTimeAsync(3 * MIN);
    expect(inPicture()).toBe(true);
  });

  it('visibilitychange repetido no apila nada', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(3000); // ya terminó el fundido de la primera foto (2,2 s)
    const timers = vi.getTimerCount();
    setHidden(false); setHidden(false);
    setHidden(true); setHidden(true);
    setHidden(false); setHidden(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(vi.getTimerCount()).toBe(timers);
    const np = svcCalls.nowPlaying;
    await vi.advanceTimersByTimeAsync(NOWPLAYING_POLL_MS);
    expect(svcCalls.nowPlaying).toBe(np + 1);
  });
});

describe('ciclo de vida: orden de eventos y música (revisión 1)', () => {
  const plays = () => order.filter((x) => x === 'play').length;
  const later = (ms: number, v: any) => () => new Promise((r) => setTimeout(() => r(v), ms));

  it('visibilitychange → webOSRelaunch con Spotify sonando: la música ambiente no suena', async () => {
    npReply = () => Promise.resolve({ playing: true, title: 'A', artist: 'B' });
    boot(root());
    await vi.advanceTimersByTimeAsync(2000);
    expect(plays()).toBe(0);
    setHidden(true);
    npReply = later(800, { playing: true, title: 'A', artist: 'B' });
    const r = svcCalls.resume;
    const np = svcCalls.nowPlaying;
    setHidden(false);
    relaunch();
    await vi.advanceTimersByTimeAsync(5000);
    expect(plays()).toBe(0);
    // y no se pide dos veces lo mismo cuando llegan los dos eventos juntos
    expect(svcCalls.resume).toBe(r + 1);
    expect(svcCalls.nowPlaying).toBe(np + 1);
  });

  it('webOSRelaunch con la app aún oculta no arranca nada hasta que se ve', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(2000);
    setHidden(true);
    const np = svcCalls.nowPlaying;
    const p = plays();
    relaunch();
    await vi.advanceTimersByTimeAsync(5 * MIN);
    expect(svcCalls.nowPlaying).toBe(np);
    expect(plays()).toBe(p);
    expect(inPicture()).toBe(false);
    expect(focusedTile()).toBe(0);
    setHidden(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(svcCalls.nowPlaying).toBe(np + 1);
    expect(paused).toBe(false);
  });

  it('webOSRelaunch antes del visibilitychange (document ya visible): un solo arranque', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(3000);
    const timers = vi.getTimerCount();
    setHidden(true);
    const np = svcCalls.nowPlaying;
    const r = svcCalls.resume;
    hidden = false; // el documento ya es visible pero el evento aún no ha llegado
    relaunch();
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(3000);
    expect(svcCalls.nowPlaying).toBe(np + 1);
    expect(svcCalls.resume).toBe(r + 1);
    expect(vi.getTimerCount()).toBe(timers);
  });

  it('si «Qué suena» no contesta, la música arranca a los MUSIC_GATE_MS', async () => {
    npReply = () => new Promise(() => { /* nunca */ });
    boot(root());
    await vi.advanceTimersByTimeAsync(MUSIC_GATE_MS - 10);
    expect(plays()).toBe(0);
    await vi.advanceTimersByTimeAsync(20);
    expect(plays()).toBe(1);
    expect(MUSIC_GATE_MS).toBeLessThanOrEqual(3000);
  });

  it('oculta: quedan los mismos temporizadores que si hubiera arrancado oculta (tiempo y poco más)', async () => {
    hidden = true;
    boot(root());
    await vi.advanceTimersByTimeAsync(3000);
    const base = vi.getTimerCount(); // nada de reposo, música, sondeos, reloj ni rotación
    expect(base).toBeLessThanOrEqual(2);
    document.body.innerHTML = '<div id="root"></div>';
    hidden = false;
    boot(root());
    await vi.advanceTimersByTimeAsync(3000);
    expect(vi.getTimerCount()).toBeGreaterThan(base);
    setHidden(true);
    await vi.advanceTimersByTimeAsync(1); // tareas internas de jsdom (eventos de <audio>)
    expect(vi.getTimerCount()).toBe(base);
  });

  it('relaunch lee los parámetros del evento, no los del primer lanzamiento', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(1000);
    vi.stubGlobal('PalmSystem', { launchParams: JSON.stringify({ pictureAfterMin: 0.1, open: 'apps' }) });
    relaunch(); // detail sin parámetros
    await vi.advanceTimersByTimeAsync(10000);
    expect(inPicture()).toBe(false);
    expect(document.querySelector('.apps.open')).toBeNull();
    document.dispatchEvent(new CustomEvent('webOSRelaunch', { detail: { launchParams: { pictureAfterMin: 0.1 } } }));
    await vi.advanceTimersByTimeAsync(6000);
    expect(inPicture()).toBe(true);
  });

  it('el parámetro de desarrollo tiene un mínimo de 3 s', async () => {
    boot(root());
    document.dispatchEvent(new CustomEvent('webOSRelaunch', { detail: { launchParams: '{"pictureAfterMin":0.0001}' } }));
    await vi.advanceTimersByTimeAsync(2900);
    expect(inPicture()).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(inPicture()).toBe(true);
  });

  it('applySettings() rearma el reposo con los ajustes nuevos', async () => {
    boot(root());
    await vi.advanceTimersByTimeAsync(MIN);
    localStorage.setItem('lghome.settings', JSON.stringify({ pictureAfterMin: 1 }));
    applySettings();
    await vi.advanceTimersByTimeAsync(MIN);
    expect(inPicture()).toBe(true);
    onKey(key(13));
    localStorage.setItem('lghome.settings', JSON.stringify({ pictureMode: false }));
    applySettings();
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(inPicture()).toBe(false);
  });

  it('el puntero quieto o que solo aparece no cuenta como actividad', async () => {
    boot(root());
    const move = (x: number) => document.dispatchEvent(new MouseEvent('mousemove', { screenX: x, screenY: 5 }));
    await vi.advanceTimersByTimeAsync(3 * MIN);
    move(10);
    expect(inPicture()).toBe(false); // movimiento real: despierta
    await vi.advanceTimersByTimeAsync(3 * MIN);
    expect(inPicture()).toBe(true);
    move(10); // mismo sitio: sintético
    expect(inPicture()).toBe(true);
    const e = key(1536); // el cursor del Magic Remote aparece
    onKey(e);
    document.dispatchEvent(key(1537));
    expect(inPicture()).toBe(true);
  });
});
