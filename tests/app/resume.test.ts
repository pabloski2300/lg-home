// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const launched: Array<{ id: string; params?: object }> = [];
let items: any[] = [];
vi.mock('../../src/luna', () => ({
  launchApp: (id: string, params?: object) => { launched.push({ id, params }); return Promise.resolve(); },
  call: () => Promise.reject(new Error('sin bridge')),
  svc: (method: string) => {
    if (method === 'resume') return Promise.resolve({ items });
    if (method === 'volume') return Promise.resolve({ volume: 10, muted: false });
    return Promise.resolve({});
  },
}));

import { boot, onKey, refreshResume } from '../../src/main';

function key(code: number): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => code });
  return e;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const mk = (n: number, over: any = {}) => Array.from({ length: n }, (_, i) => Object.assign(
  { id: 'id' + i, title: 'Título ' + i, subtitle: 'T1 E' + i + ' · Serie', progress: 0.4, minutesLeft: 20, image: 'http://x/' + i + '.jpg' }, over));

describe('fila de seguir viendo', () => {
  beforeEach(() => {
    launched.length = 0; items = [];
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('lista vacía oculta la fila', async () => {
    boot(document.getElementById('app')!);
    await flush();
    const row = document.querySelector('.resume') as HTMLElement;
    expect(row.style.display).toBe('none');
    expect(document.querySelectorAll('.rcard').length).toBe(0);
  });

  it('con elementos muestra hasta 8 tarjetas con progreso', async () => {
    items = mk(10);
    boot(document.getElementById('app')!);
    await flush();
    expect((document.querySelector('.resume') as HTMLElement).style.display).not.toBe('none');
    expect(document.querySelectorAll('.rcard').length).toBe(8);
    expect((document.querySelector('.rbar > i') as HTMLElement).style.width).toBe('40%');
    expect(document.querySelector('.rcard .rmin')!.textContent).toBe('20 min');
  });

  it('título largo lleva clase de elipsis', async () => {
    items = mk(1, { title: 'x'.repeat(200) });
    boot(document.getElementById('app')!);
    await flush();
    expect(document.querySelector('.rcard .rt')!.classList.contains('ell')).toBe(true);
  });

  it('image null → tarjeta con color de relleno', async () => {
    items = mk(1, { image: null });
    boot(document.getElementById('app')!);
    await flush();
    expect(document.querySelector('.rcard .rimg')!.classList.contains('noimg')).toBe(true);
    expect(document.querySelector('.rcard img')).toBeNull();
  });

  it('OK lanza org.jellyfin.webos sin params (resultado c del spike)', async () => {
    items = mk(3);
    boot(document.getElementById('app')!);
    await flush();
    onKey(key(38)); // dock → entradas
    onKey(key(38)); // entradas → fila
    expect(document.querySelector('.rcard.focused')).not.toBeNull();
    onKey(key(39));
    onKey(key(13));
    expect(launched).toEqual([{ id: 'org.jellyfin.webos', params: undefined }]);
  });

  it('si la fila se vacía con el foco dentro, el foco pasa a las entradas', async () => {
    items = mk(2);
    boot(document.getElementById('app')!);
    await flush();
    onKey(key(38)); onKey(key(38));
    items = [];
    await refreshResume();
    expect(document.querySelector('.rcard')).toBeNull();
    expect(document.querySelector('.pill.focused')).not.toBeNull();
  });
});
