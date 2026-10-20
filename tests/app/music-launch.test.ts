// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const order: string[] = [];
vi.mock('../../src/luna', () => ({
  launchApp: (id: string) => { order.push('launch:' + id); return Promise.resolve(); },
  call: () => Promise.reject(new Error('sin bridge')),
  svc: () => Promise.reject(new Error('sin bridge')),
}));

import { boot, onKey } from '../../src/main';

let paused = true;
function key(code: number): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => code });
  return e;
}

beforeEach(() => {
  vi.useFakeTimers();
  order.length = 0;
  paused = true;
  localStorage.clear();
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function () { paused = false; order.push('play'); return Promise.resolve(); });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function () { paused = true; order.push('pause'); });
  Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get: () => paused });
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('música y lanzamiento de apps', () => {
  it('lanzar una app pausa la música antes de llamar a launchApp', async () => {
    boot(document.getElementById('root')!);
    await vi.advanceTimersByTimeAsync(2000);
    expect(paused).toBe(false);
    onKey(key(49)); // tecla 1: lanza la primera app del dock
    expect(order.indexOf('pause')).toBeGreaterThan(-1);
    expect(order.indexOf('pause')).toBeLessThan(order.findIndex((x) => x.indexOf('launch:') === 0));
    expect(paused).toBe(true);
  });

  it('al ocultarse la app se pausa en el acto, sin esperar al fundido', async () => {
    boot(document.getElementById('root')!);
    await vi.advanceTimersByTimeAsync(2000);
    expect(paused).toBe(false);
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(paused).toBe(true); // síncrono: ningún timer avanzado
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  it('un segundo boot() para la música anterior', async () => {
    boot(document.getElementById('root')!);
    await vi.advanceTimersByTimeAsync(2000);
    expect(paused).toBe(false);
    document.body.innerHTML = '<div id="root"></div>';
    boot(document.getElementById('root')!);
    expect(order.filter((x) => x === 'pause').length).toBeGreaterThan(0);
  });
});
