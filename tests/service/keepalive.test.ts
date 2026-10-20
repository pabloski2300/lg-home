import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const ka = require('../../service/lib/keepalive.js');

function fakeService() {
  const created: Array<{ spec: any; cb: (a: any) => void }> = [];
  const service = {
    activityManager: {
      create(spec: any, cb: (a: any) => void) { created.push({ spec, cb }); },
    },
  };
  return { service, created };
}

describe('keepAlive', () => {
  it('crea una sola actividad "keepAlive" que nunca se completa', () => {
    const { service, created } = fakeService();
    const logs: string[] = [];
    ka.keepAlive(service, (m: string) => logs.push(m));
    expect(created.length).toBe(1);
    expect(created[0].spec).toBe('keepAlive');
    created[0].cb({ activityId: 42, activity: { name: 'keepAlive1' } });
    expect(logs).toEqual(['keepAlive: actividad 42 (el servicio queda residente)']);
  });

  it('anota el fallo si el gestor de actividades rechaza la creación', () => {
    const { service, created } = fakeService();
    const logs: string[] = [];
    ka.keepAlive(service, (m: string) => logs.push(m));
    created[0].cb({ returnValue: false, errorText: 'denegado' });
    expect(logs).toEqual(['keepAlive: no se pudo crear la actividad: denegado']);
  });

  it('no rompe si el servicio no tiene activityManager', () => {
    const logs: string[] = [];
    expect(() => ka.keepAlive({}, (m: string) => logs.push(m))).not.toThrow();
    expect(logs[0]).toMatch(/sin activityManager/);
  });
});
