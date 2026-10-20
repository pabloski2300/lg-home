// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { call, launchApp, LAUNCH_DIRECT_TIMEOUT_MS } from '../../src/luna';
import { getLastApp } from '../../src/store';

type Handler = (uri: string, params: any) => any;
const calls: Array<{ uri: string; params: any }> = [];

function fakeBridge(handler: Handler | null) {
  (window as any).PalmServiceBridge = function(this: any) {
    this.call = (uri: string, p: string) => {
      const params = JSON.parse(p);
      calls.push({ uri, params });
      if (!handler) return; // nunca responde
      const res = handler(uri, params);
      setTimeout(() => this.onservicecallback(JSON.stringify(res)), 0);
    };
    this.cancel = () => {};
  };
}

beforeEach(() => {
  calls.length = 0;
  localStorage.clear();
});

describe('call', () => {
  it('resuelve con la respuesta del bridge', async () => {
    fakeBridge(() => ({ returnValue: true, x: 1 }));
    const r = await call<{ x: number }>('luna://a/b', { q: 1 });
    expect(r.x).toBe(1);
    expect(calls[0]).toEqual({ uri: 'luna://a/b', params: { q: 1 } });
  });

  it('rechaza con returnValue false', async () => {
    fakeBridge(() => ({ returnValue: false, errorText: 'malo' }));
    await expect(call('luna://a/b')).rejects.toThrow('malo');
  });

  it('rechaza al agotar el tiempo', async () => {
    fakeBridge(null);
    await expect(call('luna://a/b', {}, 20)).rejects.toThrow(/tiempo/i);
  });
});

describe('launchApp', () => {
  it('lanza directo con applicationManager y no despierta el servicio', async () => {
    fakeBridge(() => ({ returnValue: true }));
    await launchApp('x', { a: 1 });
    expect(calls.map((c) => c.uri)).toEqual(['luna://com.webos.applicationManager/launch']);
    expect(calls[0].params).toEqual({ id: 'x', params: { a: 1 } });
    expect(getLastApp()).toBe('x');
  });

  it('sin params no manda la clave params', async () => {
    fakeBridge(() => ({ returnValue: true }));
    await launchApp('youtube.leanback.v4');
    expect(calls[0].params).toEqual({ id: 'youtube.leanback.v4' });
  });

  it('usa el servicio como respaldo si la llamada directa falla y guarda lastApp', async () => {
    fakeBridge((uri) =>
      uri === 'luna://com.webos.applicationManager/launch'
        ? { returnValue: false, errorText: 'denegado' }
        : { returnValue: true });
    await launchApp('youtube.leanback.v4');
    expect(calls.map((c) => c.uri)).toEqual([
      'luna://com.webos.applicationManager/launch',
      'luna://com.lghome.app.service/launch',
    ]);
    expect(calls[1].params).toEqual({ id: 'youtube.leanback.v4' });
    expect(getLastApp()).toBe('youtube.leanback.v4');
  });

  it('si la directa no responde a tiempo la da por lanzada: sin respaldo, un solo lanzamiento', async () => {
    vi.useFakeTimers();
    try {
      fakeBridge(null); // nunca responde
      const p = launchApp('z');
      await vi.advanceTimersByTimeAsync(LAUNCH_DIRECT_TIMEOUT_MS + 10);
      await p;
      expect(calls.map((c) => c.uri)).toEqual(['luna://com.webos.applicationManager/launch']);
      expect(getLastApp()).toBe('z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('returnValue:false en la directa recurre al servicio una sola vez', async () => {
    fakeBridge((uri) =>
      uri === 'luna://com.webos.applicationManager/launch' ? { returnValue: false, errorText: 'x' } : { returnValue: true });
    await launchApp('w');
    expect(calls.filter((c) => c.uri === 'luna://com.lghome.app.service/launch').length).toBe(1);
    expect(calls.length).toBe(2);
  });

  it('rechaza y no toca lastApp si fallan las dos vías', async () => {
    fakeBridge(() => ({ returnValue: false, errorText: 'no' }));
    await expect(launchApp('y')).rejects.toThrow('no');
    expect(calls.length).toBe(2);
    expect(getLastApp()).not.toBe('y');
  });
});

import { installMock } from '../../src/dev/mock';
describe('installMock', () => {
  it('responde con handlers y rechaza URIs desconocidas', async () => {
    delete (window as any).PalmServiceBridge;
    installMock({ 'luna://x/ok': () => ({ returnValue: true, v: 7 }) });
    expect((await call<{ v: number }>('luna://x/ok')).v).toBe(7);
    await expect(call('luna://x/otra')).rejects.toThrow('mock: no handler');
  });
});
