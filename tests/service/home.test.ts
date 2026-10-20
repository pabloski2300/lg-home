import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const home = require('../../service/lib/home.js');

type Call = { uri: string; payload: any };

function fakeLuna(defaultApps: Record<string, string>) {
  const calls: Call[] = [];
  const luna = (uri: string, payload: any) => {
    calls.push({ uri, payload });
    if (uri.endsWith('/getSystemSettings')) {
      return Promise.resolve({ returnValue: true, settings: { defaultApps } });
    }
    return Promise.resolve({ returnValue: true });
  };
  return { luna, calls };
}

describe('home', () => {
  it('exporta los ids', () => {
    expect(home.APP_ID).toBe('com.lghome.app');
    expect(home.LG_HOME).toBe('com.webos.app.fullhome');
  });

  it('getHome lee defaultApps', async () => {
    const { luna, calls } = fakeLuna({ home: 'com.webos.app.fullhome' });
    const r = await home.getHome(luna);
    expect(r).toEqual({ home: 'com.webos.app.fullhome', isOurs: false });
    expect(calls[0].uri).toBe('luna://com.webos.settingsservice/getSystemSettings');
    expect(calls[0].payload).toEqual({ category: 'general', keys: ['defaultApps'] });
  });

  it('getHome detecta que el inicio es nuestro', async () => {
    const { luna } = fakeLuna({ home: 'com.lghome.app' });
    expect(await home.getHome(luna)).toEqual({ home: 'com.lghome.app', isOurs: true });
  });

  it('setHome(true) escribe nuestro id', async () => {
    const { luna, calls } = fakeLuna({ home: 'com.webos.app.fullhome' });
    const r = await home.setHome(luna, true);
    expect(r).toEqual({ home: 'com.lghome.app' });
    const set = calls.find((c) => c.uri === 'luna://com.webos.settingsservice/setSystemSettings')!;
    expect(set.payload).toEqual({
      category: 'general',
      settings: { defaultApps: { home: 'com.lghome.app' } },
    });
  });

  it('setHome(false) restaura LG', async () => {
    const { luna, calls } = fakeLuna({ home: 'com.lghome.app' });
    const r = await home.setHome(luna, false);
    expect(r).toEqual({ home: 'com.webos.app.fullhome' });
    const set = calls.find((c) => c.uri.endsWith('/setSystemSettings'))!;
    expect(set.payload.settings.defaultApps.home).toBe('com.webos.app.fullhome');
  });

  it('setHome conserva otras claves de defaultApps', async () => {
    const { luna, calls } = fakeLuna({ home: 'com.webos.app.fullhome', foo: 'x' });
    await home.setHome(luna, true);
    const set = calls.find((c) => c.uri.endsWith('/setSystemSettings'))!;
    expect(set.payload.settings.defaultApps).toEqual({ home: 'com.lghome.app', foo: 'x' });
  });

  it('setHome no escribe si la lectura falla', async () => {
    const calls: Call[] = [];
    const luna = (uri: string, payload: any) => {
      calls.push({ uri, payload });
      return Promise.reject(new Error('boom'));
    };
    await expect(home.setHome(luna, true)).rejects.toThrow();
    expect(calls.some((c) => c.uri.endsWith('/setSystemSettings'))).toBe(false);
  });

  it('setHome no escribe si la lectura no trae settings', async () => {
    const calls: Call[] = [];
    const luna = (uri: string, payload: any) => {
      calls.push({ uri, payload });
      return Promise.resolve({ returnValue: true });
    };
    await expect(home.setHome(luna, true)).rejects.toThrow();
    expect(calls.some((c) => c.uri.endsWith('/setSystemSettings'))).toBe(false);
  });

  it('setHome rechaza si la escritura falla', async () => {
    const luna = (uri: string) =>
      uri.endsWith('/setSystemSettings')
        ? Promise.reject(new Error('write failed'))
        : Promise.resolve({ returnValue: true, settings: { defaultApps: { home: 'x' } } });
    await expect(home.setHome(luna, true)).rejects.toThrow('write failed');
  });
});
