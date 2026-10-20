import { createRequire } from 'node:module';
import { createServer, Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { getJson, MAX_BYTES } = require('../../service/lib/http.js');

let server: Server | null = null;
afterEach(() => { if (server) { server.close(); server = null; } });

function serve(h: (req: any, res: any) => void): Promise<string> {
  return new Promise((resolve) => {
    server = createServer(h).listen(0, '127.0.0.1', () => resolve('http://127.0.0.1:' + (server!.address() as any).port));
  });
}

describe('getJson', () => {
  it('200 con JSON devuelve el objeto y envía las cabeceras', async () => {
    const base = await serve((req, res) => { res.end(JSON.stringify({ tok: req.headers['x-emby-token'] })); });
    expect(await getJson(base + '/a', { 'X-Emby-Token': 'k' })).toEqual({ tok: 'k' });
  });
  it('estado distinto de 2xx → rechaza', async () => {
    const base = await serve((req, res) => { res.statusCode = 401; res.end('{}'); });
    await expect(getJson(base, {})).rejects.toThrow('HTTP 401');
  });
  it('JSON no válido → rechaza', async () => {
    const base = await serve((req, res) => { res.end('<html>'); });
    await expect(getJson(base, {})).rejects.toThrow();
  });
  it('servidor lento → rechaza al vencer el plazo', async () => {
    const base = await serve(() => { /* nunca responde */ });
    await expect(getJson(base, {}, 150)).rejects.toThrow('tiempo agotado');
  });
  it('goteo lento (el socket no queda inactivo) también vence por el plazo total', async () => {
    const base = await serve((req, res) => {
      res.write('{');
      const t = setInterval(() => res.write(' '), 40);
      res.on('close', () => clearInterval(t));
    });
    const t0 = Date.now();
    await expect(getJson(base, {}, 300)).rejects.toThrow('tiempo agotado');
    expect(Date.now() - t0).toBeLessThan(1500);
  });
  it('cuerpo demasiado grande → rechaza', async () => {
    const base = await serve((req, res) => { res.end('"' + 'a'.repeat(MAX_BYTES + 10) + '"'); });
    await expect(getJson(base, {})).rejects.toThrow('demasiado grande');
  });
});
