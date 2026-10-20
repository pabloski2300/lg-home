// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FocusModel } from '../../src/focus';
import { mountVolume } from '../../src/views/volume';

describe('volumen: reintentos al arrancar', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  function setup(replies: any[]) {
    const call = vi.fn(() => {
      const r = replies.length > 1 ? replies.shift() : replies[0];
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    });
    const el = document.createElement('div');
    const focus = new FocusModel(['top'] as any);
    const v = mountVolume(el, focus, 1, { call: call as any });
    return { call, el, v };
  }
  const tick = async (ms: number) => { await vi.advanceTimersByTimeAsync(ms); };

  it('una primera respuesta inválida se reintenta y acaba mostrando el valor', async () => {
    const { call, el } = setup([{ returnValue: true }, new Error('servicio no listo'), { volume: 33, muted: false }]);
    await tick(0);
    expect(el.querySelector('.vnum')!.textContent).toBe('–');
    await tick(2000);
    expect(call).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.vnum')!.textContent).toBe('–');
    await tick(5000);
    expect(call).toHaveBeenCalledTimes(3);
    expect(el.querySelector('.vnum')!.textContent).toBe('33');
    await tick(120000);
    expect(call).toHaveBeenCalledTimes(3); // con dato válido ya no reintenta
  });

  it('tras la tercera espera reintenta cada 30 s', async () => {
    const { call } = setup([{}]);
    await tick(0);
    await tick(2000 + 5000 + 10000);
    expect(call).toHaveBeenCalledTimes(4);
    await tick(30000);
    expect(call).toHaveBeenCalledTimes(5);
    await tick(30000);
    expect(call).toHaveBeenCalledTimes(6);
  });

  it('oculto no reintenta; al volver a ser visible lee de nuevo', async () => {
    const { call, el, v } = setup([{}, { volume: 12, muted: true }]);
    await tick(0);
    v.pause();
    await tick(60000);
    expect(call).toHaveBeenCalledTimes(1);
    v.resume();
    await tick(0);
    expect(call).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.vnum')!.textContent).toBe('12');
  });

  it('stop cancela el reintento pendiente', async () => {
    const { call, v } = setup([{}]);
    await tick(0);
    v.stop();
    await tick(60000);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
