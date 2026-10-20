// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: Array<{ method: string; p: any }> = [];
let level = 40;
let muted = false;
vi.mock('../../src/luna', () => ({
  launchApp: () => Promise.resolve(),
  call: () => Promise.reject(new Error('sin bridge')),
  svc: (method: string, p: any) => {
    calls.push({ method, p });
    if (p && p.action === 'up') level++;
    if (p && p.action === 'down') level--;
    return Promise.resolve({ volume: level, muted });
  },
}));

import { boot, onKey } from '../../src/main';

function key(code: number): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => code });
  return e;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const UP = 38, DOWN = 40, LEFT = 37, RIGHT = 39;

describe('volumen en pantalla', () => {
  beforeEach(() => {
    calls.length = 0; level = 40; muted = false;
    document.body.innerHTML = '<div id="app"></div>';
    boot(document.getElementById('app')!);
  });

  it('consulta el volumen al arrancar y lo pinta', async () => {
    await flush();
    expect(calls[0]).toEqual({ method: 'volume', p: { action: 'get' } });
    expect((document.querySelector('.vfill') as HTMLElement).style.width).toBe('40%');
  });

  it('al ganar el foco consulta; izquierda/derecha bajan/suben un paso', async () => {
    await flush();
    calls.length = 0;
    onKey(key(UP)); onKey(key(UP)); onKey(key(RIGHT)); // dock -> entradas -> engranaje -> volumen
    await flush();
    expect(document.querySelector('.volume')!.className).toContain('focused');
    expect(calls.map((c) => c.p.action)).toEqual(['get']);
    onKey(key(RIGHT)); await flush();
    onKey(key(LEFT)); await flush(); onKey(key(LEFT)); await flush();
    expect(calls.map((c) => c.p.action)).toEqual(['get', 'up', 'down', 'down']);
    expect(document.querySelector('.vnum')!.textContent).toBe('39');
    onKey(key(DOWN));
    expect(document.querySelector('.volume')!.className).not.toContain('focused');
  });

  it('muestra el silencio', async () => {
    muted = true;
    boot(document.getElementById('app')!);
    await flush();
    expect(document.querySelector('.volume')!.className).toContain('muted');
  });
});
