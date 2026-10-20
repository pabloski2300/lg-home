// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let hidden = true;
let volumeCalls = 0;
vi.mock('../../src/luna', () => ({
  launchApp: () => Promise.resolve(),
  call: () => Promise.reject(new Error('sin bridge')),
  svc: (method: string) => {
    if (method === 'volume') { volumeCalls++; return Promise.resolve(volumeCalls >= 3 ? { volume: 21, muted: false } : { returnValue: true }); }
    if (method === 'resume') return Promise.resolve({ items: [] });
    return Promise.resolve({ returnValue: true });
  },
}));

import { boot } from '../../src/main';

describe('volumen con arranque oculto', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hidden = true; volumeCalls = 0;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('oculto no reintenta; al hacerse visible vuelve a leer', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    boot(document.getElementById('app')!);
    await vi.advanceTimersByTimeAsync(0);
    expect(volumeCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(volumeCalls).toBe(1);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(volumeCalls).toBe(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(volumeCalls).toBe(3);
    expect(document.querySelector('.vnum')!.textContent).toBe('21');
  });
});
