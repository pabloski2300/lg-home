import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IdleTimer } from '../../src/idle';

const MIN = 60000;

describe('IdleTimer (modo cuadro)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('entra en reposo tras pictureAfterMin', () => {
    const onIdle = vi.fn();
    const onWake = vi.fn();
    const t = new IdleTimer(3 * MIN, onIdle, onWake);
    vi.advanceTimersByTime(3 * MIN - 1);
    expect(onIdle).not.toHaveBeenCalled();
    expect(t.idleSince()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(t.idleSince()).toBe(Date.now());
    vi.advanceTimersByTime(60 * MIN);
    expect(onIdle).toHaveBeenCalledTimes(1); // no se repite mientras sigue en reposo
    expect(onWake).not.toHaveBeenCalled();
    t.stop();
  });

  it('poke en reposo despierta y devuelve true (la tecla no lanza nada)', () => {
    const onIdle = vi.fn();
    const onWake = vi.fn();
    const t = new IdleTimer(1000, onIdle, onWake);
    vi.advanceTimersByTime(1000);
    expect(t.poke()).toBe(true);
    expect(onWake).toHaveBeenCalledTimes(1);
    expect(t.idleSince()).toBeNull();
    // y vuelve a contar desde cero
    vi.advanceTimersByTime(999);
    expect(onIdle).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledTimes(2);
    t.stop();
  });

  it('poke normal reinicia el temporizador y devuelve false', () => {
    const onIdle = vi.fn();
    const onWake = vi.fn();
    const t = new IdleTimer(1000, onIdle, onWake);
    vi.advanceTimersByTime(800);
    expect(t.poke()).toBe(false);
    vi.advanceTimersByTime(800);
    expect(onIdle).not.toHaveBeenCalled();
    expect(onWake).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0); // un solo temporizador, ya consumido
    t.stop();
  });

  it('usa los temporizadores inyectados y stop() los suelta', () => {
    const set = vi.fn(() => 7 as any);
    const clear = vi.fn();
    const t = new IdleTimer(500, () => {}, () => {}, { setTimeout: set as any, clearTimeout: clear as any });
    expect(set).toHaveBeenCalledTimes(1);
    t.stop();
    expect(clear).toHaveBeenCalledWith(7);
    expect(t.idleSince()).toBeNull();
  });

  it('stop() en reposo no llama a onWake y un poke posterior vuelve a armarlo', () => {
    const onIdle = vi.fn();
    const onWake = vi.fn();
    const t = new IdleTimer(1000, onIdle, onWake);
    vi.advanceTimersByTime(1000);
    t.stop();
    expect(onWake).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(t.poke()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(onIdle).toHaveBeenCalledTimes(2);
    t.stop();
  });

  it('un tiempo no válido (0, negativo, NaN, Infinity) nunca entra en reposo', () => {
    for (const ms of [0, -5, NaN, Infinity]) {
      const onIdle = vi.fn();
      const t = new IdleTimer(ms, onIdle, () => {});
      vi.advanceTimersByTime(24 * 60 * MIN);
      expect(onIdle).not.toHaveBeenCalled();
      expect(t.poke()).toBe(false);
      t.stop();
    }
  });
});
