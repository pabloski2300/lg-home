import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const apps = require('../../service/lib/apps.js');

const fixture = JSON.parse(readFileSync(new URL('../fixtures/launchpoints.json', import.meta.url), 'utf8'));

type Call = { uri: string; payload: any };
function fakeLuna(launchPoints: any[]) {
  const calls: Call[] = [];
  const luna = (uri: string, payload: any) => {
    calls.push({ uri, payload });
    return Promise.resolve({ returnValue: true, launchPoints });
  };
  return { luna, calls };
}

const extra = [
  { id: 'com.webos.app.fullhome', title: 'Inicio LG', icon: '/x/fullhome.png' },
  { id: 'com.webos.app.home', title: 'Home', icon: '/x/home.png' },
  { id: 'com.webos.app.hdmi1', title: 'HDMI 1', icon: '/x/h1.png' },
  { id: 'com.webos.app.hdmi2', title: 'HDMI 2', icon: '/x/h2.png' },
  { id: 'com.webos.app.hdmi3', title: 'HDMI 3', icon: '/x/h3.png' },
  { id: 'oculta', title: 'Oculta', icon: '/x/o.png', visible: false },
  { id: 'sin-grande', title: 'Sin grande', icon: '/x/pequeno.png' },
  { id: 'con-grande', title: 'Con grande', icon: '/x/pequeno.png', largeIcon: '/x/grande.png' },
];

describe('listApps', () => {
  it('listApps filtra dock, propias y ocultas', async () => {
    const { luna, calls } = fakeLuna(fixture.launchPoints.concat(extra));
    const list = await apps.listApps(luna);
    const ids = list.map((a: any) => a.id);
    expect(calls[0].uri).toBe('luna://com.webos.applicationManager/listLaunchPoints');
    for (const out of [
      'com.lghome.app', 'youtube.leanback.v4', 'spotify-beehive', 'org.jellyfin.webos',
      'com.webos.app.fullhome', 'com.webos.app.home', 'oculta', 'com.webos.app.hdmi1', 'com.webos.app.hdmi2',
    ]) expect(ids).not.toContain(out);
    // el resto de la TV sí aparece
    expect(ids).toContain('netflix');
    expect(ids).toContain('com.webos.app.hdmi3');
    expect(ids.length).toBe(fixture.launchPoints.length - 4 + 3);
  });

  it('devuelve {id, title, icon} con largeIcon antes que icon', async () => {
    const { luna } = fakeLuna(extra);
    const list = await apps.listApps(luna);
    expect(list.find((a: any) => a.id === 'con-grande')).toEqual({ id: 'con-grande', title: 'Con grande', icon: '/x/grande.png' });
    expect(list.find((a: any) => a.id === 'sin-grande').icon).toBe('/x/pequeno.png');
    expect(Object.keys(list[0]).sort()).toEqual(['icon', 'id', 'title']);
  });

  it('tolera respuesta sin launchPoints', async () => {
    const luna = () => Promise.resolve({ returnValue: true });
    expect(await apps.listApps(luna)).toEqual([]);
  });
});

describe('launch', () => {
  it('lanza por applicationManager con id y params', async () => {
    const calls: Call[] = [];
    const luna = (uri: string, payload: any) => { calls.push({ uri, payload }); return Promise.resolve({ returnValue: true }); };
    await apps.launch(luna, 'netflix', { a: 1 });
    expect(calls).toEqual([{ uri: 'luna://com.webos.applicationManager/launch', payload: { id: 'netflix', params: { a: 1 } } }]);
    await apps.launch(luna, 'netflix');
    expect(calls[1].payload).toEqual({ id: 'netflix' });
  });

  it('rechaza un id vacío sin llamar a luna', async () => {
    const calls: Call[] = [];
    const luna = (uri: string, payload: any) => { calls.push({ uri, payload }); return Promise.resolve({}); };
    await expect(apps.launch(luna, '')).rejects.toThrow();
    await expect(apps.launch(luna, undefined)).rejects.toThrow();
    expect(calls.length).toBe(0);
  });
});

describe('cacheIcons', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const mkTmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lgh-')));

  it('copia los iconos permitidos y devuelve rutas relativas', () => {
    const tmp = mkTmp();
    const root = path.join(tmp, 'apps') + path.sep;
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'src.PNG'), 'png');
    const dir = path.join(tmp, 'icons');
    const list = [
      { id: 'a.b/c', title: 'A', icon: path.join(root, 'src.PNG') },
      { id: 'sin', title: 'S', icon: '' },
    ];
    const out = apps.cacheIcons(list, dir, { roots: [root] });
    expect(out[0]).toEqual({ id: 'a.b/c', title: 'A', icon: 'icons/a.b_c.png' });
    expect(out[1].icon).toBe('');
    expect(fs.readFileSync(path.join(dir, 'a.b_c.png'), 'utf8')).toBe('png');
    expect(fs.readdirSync(dir).filter((n: string) => /\.tmp$/.test(n))).toEqual([]);
    expect(apps.cacheIcons(list, dir, { roots: [root] })[0].icon).toBe('icons/a.b_c.png'); // idempotente
    fs.rmSync(tmp, { recursive: true });
  });

  it('no copia fuera de la lista blanca, con .., symlinks ni extensiones raras', () => {
    const tmp = mkTmp();
    const root = path.join(tmp, 'apps') + path.sep;
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(tmp, 'secreto.png'), 'x');
    fs.writeFileSync(path.join(root, 'clave.txt'), 'x');
    fs.writeFileSync(path.join(root, 'ok.png'), 'x');
    let hasLink = true;
    try { fs.symlinkSync(path.join(tmp, 'secreto.png'), path.join(root, 'enlace.png')); } catch (e) { hasLink = false; } // Windows sin privilegio
    const dir = path.join(tmp, 'icons');
    const list = [
      { id: 'fuera', title: 'F', icon: path.join(tmp, 'secreto.png') },
      { id: 'trav', title: 'T', icon: path.join(root, '..', 'secreto.png') },
      { id: 'link', title: 'L', icon: hasLink ? path.join(root, 'enlace.png') : '' },
      { id: 'ext', title: 'E', icon: path.join(root, 'clave.txt') },
      { id: 'bien', title: 'B', icon: path.join(root, 'ok.png') },
    ];
    const out = apps.cacheIcons(list, dir, { roots: [root] });
    expect(out.map((a: any) => a.icon)).toEqual(['', '', '', '', 'icons/bien.png']);
    expect(fs.readdirSync(dir)).toEqual(['bien.png']);
    fs.rmSync(tmp, { recursive: true });
  });

  it('registra los fallos de copia y deja el icono vacío', () => {
    const tmp = mkTmp();
    const root = path.join(tmp, 'apps') + path.sep;
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'a.png'), 'x');
    const logs: string[] = [];
    const real = fs;
    const fsx = Object.assign({}, real, { copyFileSync: () => { throw new Error('disco lleno'); } });
    const out = apps.cacheIcons([{ id: 'a', title: 'A', icon: path.join(root, 'a.png') }], path.join(tmp, 'icons'),
      { roots: [root], fs: fsx, log: (m: string) => logs.push(m) });
    expect(out[0].icon).toBe('');
    expect(logs.length).toBe(1);
    expect(logs[0]).toContain('1 fallo');
    expect(logs[0]).toContain('disco lleno');
    fs.rmSync(tmp, { recursive: true });
  });

  it('registra un mkdir que falla por algo distinto de EEXIST', () => {
    const logs: string[] = [];
    const fsx = { mkdirSync: () => { const e: any = new Error('sin permiso'); e.code = 'EACCES'; throw e; } };
    apps.cacheIcons([], '/x/icons', { fs: fsx, log: (m: string) => logs.push(m) });
    expect(logs[0]).toContain('sin permiso');
  });
});
