import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const exec = require('../../service/lib/exec.js');
const ha = require('../../service/lib/ha.js');
const jf = require('../../service/lib/jellyfin.js');

let dir: string;
let file: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'lghlog-')); file = join(dir, 'x.log'); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('createLogger: tope de tamaño', () => {
  it('añade líneas con hora', () => {
    const log = exec.createLogger(file, 1000);
    log('hola');
    expect(readFileSync(file, 'utf8')).toMatch(/^\d{4}-\d\d-\d\dT.* hola\n$/);
  });

  it('al pasar del tope vacía el fichero y sigue (nunca crece sin límite)', () => {
    const log = exec.createLogger(file, 500);
    for (let i = 0; i < 2000; i++) log('linea ' + i);
    expect(statSync(file).size).toBeLessThan(500 + 100);
    expect(readFileSync(file, 'utf8')).toContain('linea 1999');
  });

  it('no lanza si el fichero no se puede escribir', () => {
    const log = exec.createLogger(join(dir, 'no', 'existe', 'x.log'), 100);
    expect(() => log('x')).not.toThrow();
  });

  it('el tope por defecto es 256 KB', () => {
    expect(exec.MAX_LOG_BYTES).toBe(256 * 1024);
  });
});

describe('createStateLog: solo cambios de estado', () => {
  function make() {
    const lines: string[] = [];
    return { lines, stateLog: exec.createStateLog((m: string) => lines.push(m)) };
  }

  it('un fallo repetido se anota una sola vez', () => {
    const { lines, stateLog } = make();
    const l = stateLog('nowPlaying');
    for (let i = 0; i < 100; i++) l('nowPlaying: timeout');
    expect(lines).toEqual(['nowPlaying: timeout']);
  });

  it('un fallo distinto se anota; la recuperación se anota una vez', () => {
    const { lines, stateLog } = make();
    const l = stateLog('nowPlaying');
    l('nowPlaying: timeout'); l('nowPlaying: ECONNREFUSED'); l('nowPlaying: ECONNREFUSED');
    l.ok(); l.ok(); l.ok();
    expect(lines).toEqual(['nowPlaying: timeout', 'nowPlaying: ECONNREFUSED', 'nowPlaying: recuperado']);
  });

  it('éxitos sin fallo previo no anotan nada; tras recuperar, un fallo vuelve a anotarse', () => {
    const { lines, stateLog } = make();
    const l = stateLog('resume');
    l.ok(); l.ok();
    expect(lines).toEqual([]);
    l('resume: x'); l.ok(); l('resume: x');
    expect(lines).toEqual(['resume: x', 'resume: recuperado', 'resume: x']);
  });

  it('las fuentes no se mezclan', () => {
    const { lines, stateLog } = make();
    stateLog('a')('a: e'); stateLog('b')('b: e');
    expect(lines).toEqual(['a: e', 'b: e']);
  });
});

describe('integración con ha.js y jellyfin.js', () => {
  const HA = { ha: { url: 'http://ha', token: 'T', spotifyEntity: 'media_player.x' } };
  const JF = { jellyfin: { url: 'http://jf', apiKey: 'K', userId: 'U' } };

  it('HA caído 50 sondeos: una línea; al volver, «recuperado»', async () => {
    const lines: string[] = [];
    const l = exec.createStateLog((m: string) => lines.push(m))('nowPlaying');
    const down = () => Promise.reject(new Error('ECONNREFUSED'));
    for (let i = 0; i < 50; i++) await ha.fetchNowPlaying(HA, down, l);
    await ha.fetchNowPlaying(HA, () => Promise.resolve({ state: 'paused' }), l);
    expect(lines).toEqual(['nowPlaying: ECONNREFUSED', 'nowPlaying: recuperado']);
  });

  it('Jellyfin caído: una línea; al volver, «recuperado»', async () => {
    const lines: string[] = [];
    const l = exec.createStateLog((m: string) => lines.push(m))('resume');
    for (let i = 0; i < 20; i++) await jf.fetchResume(JF, () => Promise.reject(new Error('timeout')), l);
    await jf.fetchResume(JF, () => Promise.resolve({ Items: [] }), l);
    expect(lines).toEqual(['resume: timeout', 'resume: recuperado']);
  });

  it('con log normal (función sin .ok) sigue funcionando', async () => {
    const logs: string[] = [];
    await ha.fetchNowPlaying(HA, () => Promise.reject(new Error('x')), (m: string) => logs.push(m));
    expect(logs).toEqual(['nowPlaying: x']);
  });
});
