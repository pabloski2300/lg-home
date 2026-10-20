// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const order: string[] = [];
type Reply = () => Promise<any>;
let replies: { [m: string]: Reply } = {};
vi.mock('../../src/luna', () => ({
  launchApp: (id: string) => { order.push('launch:' + id); return Promise.resolve(); },
  call: () => Promise.reject(new Error('sin bridge')),
  svc: (method: string, params?: any) => {
    order.push(method + (params ? ' ' + JSON.stringify(params) : ''));
    if (replies[method]) return replies[method]();
    if (method === 'nowPlaying') return Promise.resolve({ playing: false });
    if (method === 'volume') return Promise.resolve({ volume: 10, muted: false });
    if (method === 'resume') return Promise.resolve({ items: [] });
    return Promise.resolve({});
  },
}));

import { boot, onKey } from '../../src/main';
import { FocusModel } from '../../src/focus';
import { mountSettings } from '../../src/views/settings';
import { loadSettings } from '../../src/store';

const LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40, OK = 13, BACK = 461;
function key(code: number): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'keyCode', { get: () => code });
  return e;
}
const flush = () => vi.advanceTimersByTimeAsync(50);

const ok = (extra?: object) => () => Promise.resolve(Object.assign({ returnValue: true }, extra));
const serviceUp = () => {
  replies.status = ok({ root: true, version: '0.1.0' });
  replies.getHome = ok({ home: 'com.lghome.app', isOurs: true });
  replies.setHome = ok({ home: 'com.webos.app.fullhome' });
};

beforeEach(() => {
  vi.useFakeTimers();
  order.length = 0;
  replies = {};
  serviceUp();
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
});
afterEach(() => { vi.useRealTimers(); });

describe('panel de ajustes (unidad)', () => {
  let el: HTMLElement;
  let focus: FocusModel;
  let changed: number;
  let s: ReturnType<typeof mountSettings>;
  const rows = () => Array.prototype.slice.call(el.querySelectorAll('.srow')) as HTMLElement[];
  const val = (i: number) => (rows()[i].querySelector('.sval') as HTMLElement).textContent;
  async function openIt() { s.open(); await flush(); }
  const press = (code: number) => (s as any).onKey(code);
  beforeEach(() => {
    el = document.createElement('div');
    document.body.appendChild(el);
    focus = new FocusModel(['top', 'resume', 'inputs', 'dock']);
    focus.setSize('top', 2);
    focus.setSize('dock', 4);
    changed = 0;
    s = mountSettings(el, focus, { onChange: () => { changed++; } });
  });

  it('muestra las cinco opciones con sus valores actuales', async () => {
    await openIt();
    expect(s.isOpen()).toBe(true);
    expect(rows().map((r) => (r.querySelector('.slabel') as HTMLElement).textContent)).toEqual([
      'Música ambiente', 'Modo cuadro', 'Modo cuadro tras', 'Formato de hora', 'Volver a la pantalla de LG']);
    expect([val(0), val(1), val(2), val(3)]).toEqual(['Sí', 'Sí', '3 min', '24 h']);
  });

  it('cambiar una opción la guarda', async () => {
    await openIt();
    press(OK); // Música ambiente → No
    expect(loadSettings().music).toBe(false);
    expect(val(0)).toBe('No');
    press(DOWN); press(OK); // Modo cuadro → No
    expect(loadSettings().pictureMode).toBe(false);
    press(DOWN); press(RIGHT); // 3 → 5 min
    expect(loadSettings().pictureAfterMin).toBe(5);
    press(RIGHT); press(RIGHT); // 10 y tope
    expect(loadSettings().pictureAfterMin).toBe(10);
    press(LEFT);
    expect(loadSettings().pictureAfterMin).toBe(5);
    press(DOWN); press(RIGHT); // 24 h → 12 h
    expect(loadSettings().clock24).toBe(false);
    expect(val(3)).toBe('12 h');
    expect(changed).toBe(6);
    // lo demás se conserva
    expect(loadSettings().music).toBe(false);
  });

  it('Volver a la pantalla de LG llama a setHome {enabled:false} y luego lanza com.webos.app.fullhome', async () => {
    await openIt();
    for (let i = 0; i < 4; i++) press(DOWN);
    order.length = 0;
    press(OK);
    await flush();
    expect(order).toEqual(['setHome {"enabled":false}', 'launch:com.webos.app.fullhome']);
  });

  it('con el servicio caído muestra «Servicio no disponible» y desactiva «Volver a la pantalla de LG»', async () => {
    replies.status = () => Promise.reject(new Error('sin servicio'));
    replies.getHome = () => Promise.reject(new Error('sin servicio'));
    await openIt();
    expect((el.querySelector('.sstatus') as HTMLElement).textContent).toContain('Servicio no disponible');
    expect(rows()[4].className).toContain('disabled');
    for (let i = 0; i < 4; i++) press(DOWN);
    order.length = 0;
    press(OK);
    await flush();
    expect(order).toEqual([]);
  });

  it('con el servicio activo muestra «Servicio: activo (root)» y la versión', async () => {
    await openIt();
    const t = (el.querySelector('.sstatus') as HTMLElement).textContent as string;
    expect(t).toContain('Servicio: activo (root)');
    expect(t).toContain('0.1.0');
    expect(rows()[4].className).not.toContain('disabled');
  });

  it('si setHome falla muestra el error, no lanza nada y el panel sigue abierto', async () => {
    replies.setHome = () => Promise.resolve({ returnValue: false, errorText: 'no' }).then(() => { throw new Error('no'); });
    await openIt();
    for (let i = 0; i < 4; i++) press(DOWN);
    order.length = 0;
    press(OK);
    await flush();
    expect(order).toEqual(['setHome {"enabled":false}']);
    expect(s.isOpen()).toBe(true);
    expect((el.querySelector('.smsg') as HTMLElement).textContent).toContain('No se pudo');
  });

  it('si LG Home no es el inicio ofrece «Usar LG Home como inicio» (setHome {enabled:true})', async () => {
    replies.getHome = ok({ home: 'com.webos.app.fullhome', isOurs: false });
    await openIt();
    expect((rows()[4].querySelector('.slabel') as HTMLElement).textContent).toBe('Usar LG Home como inicio');
    for (let i = 0; i < 4; i++) press(DOWN);
    order.length = 0;
    press(OK);
    await flush();
    expect(order).toEqual(['setHome {"enabled":true}']); // no lanza nada
    expect(s.isOpen()).toBe(true);
    expect((rows()[4].querySelector('.slabel') as HTMLElement).textContent).toBe('Volver a la pantalla de LG');
  });

  it('mientras getHome no contesta la acción está desactivada y OK no hace nada', async () => {
    let answer: (v: any) => void = () => {};
    replies.getHome = () => new Promise((res) => { answer = res; });
    await openIt();
    expect((rows()[4].querySelector('.slabel') as HTMLElement).textContent).toBe('Comprobando…');
    expect(rows()[4].className).toContain('disabled');
    for (let i = 0; i < 4; i++) press(DOWN);
    order.length = 0;
    press(OK);
    await flush();
    expect(order).toEqual([]);
    answer({ returnValue: true, home: 'com.webos.app.fullhome', isOurs: false });
    await flush();
    expect((rows()[4].querySelector('.slabel') as HTMLElement).textContent).toBe('Usar LG Home como inicio');
    expect(rows()[4].className).not.toContain('disabled');
  });

  it('al cerrar (Atrás, scrim o «Volver») avisa con onClose para repintar', async () => {
    let closed = 0;
    const el2 = document.createElement('div');
    document.body.appendChild(el2);
    const s2 = mountSettings(el2, focus, { onClose: () => { closed++; } });
    s2.open(); await flush();
    (el2.querySelector('.settings-scrim') as HTMLElement).click();
    expect(s2.isOpen()).toBe(false);
    expect(closed).toBe(1);
    s2.open(); await flush();
    (s2 as any).onKey(BACK);
    expect(closed).toBe(2);
    s2.open(); await flush();
    for (let i = 0; i < 4; i++) (s2 as any).onKey(DOWN);
    (s2 as any).onKey(OK);
    await flush();
    expect(s2.isOpen()).toBe(false);
    expect(closed).toBe(3);
  });

  it('cada vez que se abre vuelve a consultar getHome', async () => {
    await openIt();
    expect((rows()[4].querySelector('.slabel') as HTMLElement).textContent).toBe('Volver a la pantalla de LG');
    s.close();
    replies.getHome = ok({ home: 'com.webos.app.fullhome', isOurs: false });
    await openIt();
    expect((rows()[4].querySelector('.slabel') as HTMLElement).textContent).toBe('Usar LG Home como inicio');
  });

  it('si getHome falla: acción desactivada y «No se pudo comprobar el inicio»', async () => {
    replies.getHome = () => Promise.reject(new Error('x'));
    await openIt();
    expect(rows()[4].className).toContain('disabled');
    expect((el.querySelector('.smsg') as HTMLElement).textContent).toBe('No se pudo comprobar el inicio');
    for (let i = 0; i < 4; i++) press(DOWN);
    order.length = 0;
    press(OK);
    await flush();
    expect(order).toEqual([]);
  });

  it('Atrás cierra el panel y devuelve el foco al engranaje', async () => {
    await openIt();
    focus.focus('dock', 2);
    press(BACK);
    expect(s.isOpen()).toBe(false);
    expect(focus.current()).toEqual({ zone: 'top', index: 0 });
  });

  it('las flechas no se salen de la lista', async () => {
    await openIt();
    press(UP);
    press(OK); // sigue en la primera fila
    expect(loadSettings().music).toBe(false);
    for (let i = 0; i < 9; i++) press(DOWN);
    expect(rows()[4].className).toContain('focused');
  });
});

describe('ajustes dentro de la app', () => {
  let root: HTMLElement;
  const press = (code: number) => onKey(key(code));
  const panel = () => root.querySelector('.settings') as HTMLElement;
  beforeEach(() => {
    root = document.getElementById('root')!;
    boot(root);
  });
  async function openFromHome() {
    press(UP); press(UP); // dock → entradas → engranaje
    expect(root.querySelector('.gear')!.className).toContain('focused');
    press(OK);
    await flush();
  }

  it('OK en el engranaje abre el panel; las teclas 1-4 se ignoran; Atrás lo cierra', async () => {
    await openFromHome();
    expect(panel().className).toContain('open');
    order.length = 0;
    press(49); press(52);
    await flush();
    expect(order.filter((o) => o.indexOf('launch:') === 0)).toEqual([]);
    expect(panel().className).toContain('open');
    press(BACK);
    expect(panel().className).not.toContain('open');
    expect(root.querySelector('.gear')!.className).toContain('focused');
  });

  it('cambiar el formato de hora se aplica al reloj al momento', async () => {
    expect((root.querySelector('.clock-time') as HTMLElement).textContent).toMatch(/^\d\d:\d\d$/);
    await openFromHome();
    press(DOWN); press(DOWN); press(DOWN); press(RIGHT);
    expect((root.querySelector('.clock-time') as HTMLElement).textContent).toMatch(/[ap]\. m\./);
    press(LEFT);
    expect((root.querySelector('.clock-time') as HTMLElement).textContent).toMatch(/^\d\d:\d\d$/);
  });

  it('con el panel abierto no entra el modo cuadro', async () => {
    await openFromHome();
    await vi.advanceTimersByTimeAsync(10 * 60000);
    expect(root.classList.contains('picture')).toBe(false);
  });

  it('desde el volumen, Arriba lleva al engranaje', () => {
    press(UP); press(UP); press(RIGHT); // engranaje → volumen
    expect(root.querySelector('.volume')!.className).toContain('focused');
    press(UP);
    expect(root.querySelector('.gear')!.className).toContain('focused');
  });
});
