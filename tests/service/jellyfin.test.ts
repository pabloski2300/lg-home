import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const jf = require('../../service/lib/jellyfin.js');
const cfgmod = require('../../service/lib/config.js');
const fixture = JSON.parse(readFileSync('tests/fixtures/jellyfin-resume.json', 'utf8'));

const CFG = { jellyfin: { url: 'http://jf.local:8096', apiKey: 'KEY', userId: 'U1' } };

describe('fetchResume', () => {
  it('mapea episodio y película', async () => {
    const seen: any[] = [];
    const get = (url: string, headers: any) => { seen.push({ url, headers }); return Promise.resolve(fixture); };
    const items = await jf.fetchResume(CFG, get);
    expect(seen[0].url).toBe('http://jf.local:8096/Users/U1/Items/Resume?Limit=8&MediaTypes=Video&Fields=PrimaryImageAspectRatio');
    expect(seen[0].headers['Authorization']).toBe('MediaBrowser Token="KEY"');
    expect(items[0]).toEqual({
      id: 'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      title: 'La cena del jueves',
      subtitle: 'T2 E5 · Sobremesa',
      progress: 1 / 3,
      minutesLeft: 30,
      image: 'http://jf.local:8096/Items/a1b2c3d4e5f60718293a4b5c6d7e8f90/Images/Primary?maxHeight=300&tag=tagep1',
    });
    expect(items[1].title).toBe('Viaje al faro');
    expect(items[1].subtitle).toBe('2019');
    expect(items[1].progress).toBeCloseTo(0.75);
    expect(items[1].minutesLeft).toBe(23);
    expect(items).toHaveLength(4);
  });

  it('sin ImageTags.Primary → image null', async () => {
    const items = await jf.fetchResume(CFG, () => Promise.resolve(fixture));
    expect(items[2].image).toBeNull();
    expect(items[2].subtitle).toBe('');
  });

  it('config sin jellyfin → [] sin llamadas de red', async () => {
    let calls = 0;
    const get = () => { calls++; return Promise.resolve(fixture); };
    expect(await jf.fetchResume({}, get)).toEqual([]);
    expect(await jf.fetchResume({ jellyfin: { url: '', apiKey: '', userId: '' } }, get)).toEqual([]);
    expect(calls).toBe(0);
  });

  it('error de red → [] y no se filtra la clave al registro', async () => {
    const logs: string[] = [];
    const get = () => Promise.reject(new Error('ECONNREFUSED'));
    expect(await jf.fetchResume(CFG, get, (m: string) => logs.push(m))).toEqual([]);
    expect(logs.join(' ')).not.toContain('KEY');
  });
});

describe('readConfig', () => {
  it('fichero ausente → {}', () => {
    expect(cfgmod.readConfig('/no/existe/config.json')).toEqual({});
  });
  it('fichero que no es JSON → {}', () => {
    expect(cfgmod.readConfig('README-no-existe.md')).toEqual({});
    expect(cfgmod.readConfig('tsconfig.json')).toBeTypeOf('object');
  });
  it('JSON válido se devuelve; un array o null → {}', () => {
    expect(cfgmod.readConfig('tests/fixtures/jellyfin-resume.json').Items).toHaveLength(4);
  });
});
