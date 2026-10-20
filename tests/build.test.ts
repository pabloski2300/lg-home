import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';

const root = resolve(__dirname, '..');
const dist = join(root, 'dist');
const app = join(dist, 'ipk-root', 'app');

function run(cmd: string): string {
  return execSync(cmd, { cwd: root, encoding: 'utf8', stdio: 'pipe' });
}

/** Extrae un miembro de un archivo `ar` (formato del IPK). */
function arMember(buf: Buffer, name: string): Buffer {
  let off = 8;
  while (off < buf.length) {
    const id = buf.toString('latin1', off, off + 16).trim().replace(/\/$/, '');
    const size = parseInt(buf.toString('latin1', off + 48, off + 58).trim(), 10);
    const start = off + 60;
    if (id === name) return buf.subarray(start, start + size);
    off = start + size + (size % 2);
  }
  throw new Error('miembro ar no encontrado: ' + name);
}

/** Lista (nombre, mtime en segundos) de un tar ustar/gnu. */
function tarEntries(tar: Buffer): { name: string; mtime: number }[] {
  const out: { name: string; mtime: number }[] = [];
  let off = 0;
  while (off + 512 <= tar.length) {
    const h = tar.subarray(off, off + 512);
    if (h.every((b) => b === 0)) break;
    const name = h.toString('latin1', 0, 100).replace(/\0.*$/, '');
    const size = parseInt(h.toString('latin1', 124, 136).replace(/\0.*$/, '').trim() || '0', 8);
    const mtime = parseInt(h.toString('latin1', 136, 148).replace(/\0.*$/, '').trim() || '0', 8);
    out.push({ name, mtime });
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

let ipkPath = '';

beforeAll(() => {
  run('npm run build');
  run('npm run package');
  const f = readdirSync(dist).find((n) => n.endsWith('.ipk'));
  if (!f) throw new Error('no se generó el IPK');
  ipkPath = join(dist, f);
});

describe('build', () => {
  it('bundle pasa es-check es2017', () => {
    run('npx es-check es2017 dist/ipk-root/app/main.js');
  });

  it('bundle sin APIs prohibidas', () => {
    const js = readFileSync(join(app, 'main.js'), 'utf8');
    for (const api of ['.flat(', '.flatMap(', 'fromEntries', 'matchAll', 'allSettled', 'globalThis', 'structuredClone']) {
      expect(js, api).not.toContain(api);
    }
  });

  it('css sin propiedades prohibidas', () => {
    const css = readFileSync(join(app, 'main.css'), 'utf8');
    for (const p of ['aspect-ratio', 'inset:', 'backdrop-filter']) {
      expect(css, p).not.toContain(p);
    }
  });

  it('ipk con fechas válidas', () => {
    const ar = readFileSync(ipkPath);
    const entries = tarEntries(gunzipSync(arMember(ar, 'data.tar.gz')));
    expect(entries.length).toBeGreaterThan(0);
    for (const e of entries) {
      expect(new Date(e.mtime * 1000).toISOString().slice(0, 10), e.name).not.toBe('1970-01-01');
    }
  });

  it('appinfo correcto', () => {
    const info = JSON.parse(readFileSync(join(app, 'appinfo.json'), 'utf8'));
    expect(info.id).toBe('com.lghome.app');
    expect(info.type).toBe('web');
    expect(info.appCategory).toContain('home');
  });
});

describe('codificación de los fuentes', () => {
  it('todo fichero de src, service, scripts y tests es UTF-8 estricto', () => {
    const bad: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === 'node_modules') continue;
        const p = join(d, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.(ts|js|mjs|cjs|json|sh|css|html|md)$/.test(e.name)) continue;
        try { new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(p)); } catch (err) { bad.push(p); }
      }
    };
    for (const d of ['src', 'service', 'scripts', 'tests']) walk(join(root, d));
    expect(bad).toEqual([]);
  });
});
