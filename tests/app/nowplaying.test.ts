// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

let np: any = { playing: false };
let calls = 0;
vi.mock('../../src/luna', () => ({
  launchApp: () => Promise.resolve(),
  call: () => Promise.reject(new Error('sin bridge')),
  svc: (method: string) => {
    if (method === 'nowPlaying') { calls++; return Promise.resolve(np); }
    if (method === 'volume') return Promise.resolve({ volume: 10, muted: false });
    if (method === 'resume') return Promise.resolve({ items: [] });
    return Promise.resolve({});
  },
}));

import { boot, startNowPlaying, stopNowPlaying } from '../../src/main';
import { NOWPLAYING_POLL_MS } from '../../src/views/nowplaying';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('qué suena', () => {
  beforeEach(() => {
    vi.useRealTimers();
    np = { playing: false }; calls = 0;
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('oculto si no suena nada', async () => {
    boot(document.getElementById('app')!);
    await flush();
    expect((document.querySelector('.nowplaying') as HTMLElement).style.display).toBe('none');
  });

  it('suena: muestra canción, artista y portada', async () => {
    np = { playing: true, title: 'Chandelier', artist: 'Sia', image: 'http://ha/x.jpg' };
    boot(document.getElementById('app')!);
    await flush();
    const el = document.querySelector('.nowplaying') as HTMLElement;
    expect(el.style.display).not.toBe('none');
    expect(el.querySelector('.np-t')!.textContent).toBe('Chandelier');
    expect(el.querySelector('.np-a')!.textContent).toBe('Sia');
    expect(el.querySelector('img')!.getAttribute('src')).toBe('http://ha/x.jpg');
    expect(el.querySelector('.np-t')!.classList.contains('ell')).toBe(true);
  });

  it('se oculta cuando playing pasa a false', async () => {
    np = { playing: true, title: 'A', artist: 'B', image: null };
    boot(document.getElementById('app')!);
    await flush();
    np = { playing: false };
    stopNowPlaying(); startNowPlaying();
    await flush();
    expect((document.querySelector('.nowplaying') as HTMLElement).style.display).toBe('none');
  });

  it('escapa el HTML del título y no es enfocable', async () => {
    np = { playing: true, title: '<b>x</b>', artist: '"y"', image: null };
    boot(document.getElementById('app')!);
    await flush();
    const el = document.querySelector('.nowplaying') as HTMLElement;
    expect(el.querySelector('b')).toBeNull();
    expect(el.querySelector('[tabindex]')).toBeNull();
  });

  it('consulta cada 10 s mientras está activo y deja de hacerlo al parar', async () => {
    vi.useFakeTimers();
    boot(document.getElementById('app')!);
    const base = calls;
    vi.advanceTimersByTime(NOWPLAYING_POLL_MS * 2 + 10);
    expect(calls).toBe(base + 2);
    stopNowPlaying();
    vi.advanceTimersByTime(NOWPLAYING_POLL_MS * 3);
    expect(calls).toBe(base + 2);
    startNowPlaying();
    expect(calls).toBe(base + 3);
  });
});
