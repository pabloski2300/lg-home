import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const vol = require('../../service/lib/volume.js');

type Call = { uri: string; payload: any };

function fakeLuna(start: number, opts: { muted?: boolean; noStatus?: boolean } = {}) {
  let v = start;
  const calls: Call[] = [];
  const luna = (uri: string, payload: any) => {
    calls.push({ uri, payload });
    if (uri.endsWith('/getVolume')) return Promise.resolve({ returnValue: true, volume: v });
    if (uri.endsWith('/audio/getStatus')) {
      return opts.noStatus
        ? Promise.reject(new Error('no existe'))
        : Promise.resolve({ returnValue: true, mute: !!opts.muted, volume: v });
    }
    if (uri.endsWith('/volumeUp')) v = Math.min(100, v + 1);
    if (uri.endsWith('/volumeDown')) v = Math.max(0, v - 1);
    if (uri.endsWith('/setVolume')) v = payload.volume;
    return Promise.resolve({ returnValue: true });
  };
  return { luna, calls };
}

describe('volume', () => {
  it('get devuelve volume y muted', async () => {
    const { luna, calls } = fakeLuna(35, { muted: true });
    expect(await vol.volume(luna, 'get')).toEqual({ volume: 35, muted: true });
    expect(calls[0].uri).toBe('luna://com.webos.audio/getVolume');
  });

  it('get sin estado de silencio devuelve muted=false', async () => {
    const { luna } = fakeLuna(20, { noStatus: true });
    expect(await vol.volume(luna, 'get')).toEqual({ volume: 20, muted: false });
  });

  it('set acota a 0..100', async () => {
    const a = fakeLuna(50);
    expect((await vol.volume(a.luna, 'set', 150)).volume).toBe(100);
    expect(a.calls.find((c) => c.uri.endsWith('/setVolume'))!.payload).toEqual({ volume: 100 });
    const b = fakeLuna(50);
    expect((await vol.volume(b.luna, 'set', -5)).volume).toBe(0);
    const c = fakeLuna(50);
    expect((await vol.volume(c.luna, 'set', 42.6)).volume).toBe(43);
  });

  it('set rechaza un valor que no es número', async () => {
    const { luna, calls } = fakeLuna(50);
    await expect(vol.volume(luna, 'set', 'x')).rejects.toThrow();
    expect(calls.length).toBe(0);
  });

  it('up/down llaman al método correcto y devuelven el nuevo valor', async () => {
    const { luna, calls } = fakeLuna(30);
    expect(await vol.volume(luna, 'up')).toEqual({ volume: 31, muted: false });
    expect(await vol.volume(luna, 'down')).toEqual({ volume: 30, muted: false });
    const uris = calls.map((c) => c.uri);
    expect(uris).toContain('luna://com.webos.audio/volumeUp');
    expect(uris).toContain('luna://com.webos.audio/volumeDown');
  });

  it('rechaza una acción desconocida', async () => {
    const { luna } = fakeLuna(30);
    await expect(vol.volume(luna, 'boom')).rejects.toThrow();
  });
});
