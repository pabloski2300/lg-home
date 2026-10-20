// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const launched: string[] = [];
let listing: Array<{ id: string; title: string; icon: string }> | Error = [];
vi.mock('../../src/luna', () => ({
  launchApp: (id: string) => { launched.push(id); return Promise.resolve(); },
  call: () => Promise.reject(new Error('sin bridge')),
  svc: (m: string) => {
    if (m !== 'listApps') return Promise.reject(new Error('no mock ' + m));
    return listing instanceof Error ? Promise.reject(listing) : Promise.resolve({ apps: listing });
  },
}));

import { boot, LAUNCH_COOLDOWN_MS, onKey } from '../../src/main';
import { cols } from '../../src/views/apps';

function key(code: number, repeat = false): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, repeat });
  Object.defineProperty(e, 'keyCode', { get: () => code });
  return e;
}
const press = (code: number, repeat = false) => onKey(key(code, repeat));
const flush = () => vi.advanceTimersByTimeAsync(50);
const settle = () => vi.advanceTimersByTimeAsync(LAUNCH_COOLDOWN_MS + 50);
const LEFT = 37, UP = 38, RIGHT = 39, DOWN = 40, OK = 13, BACK = 461;

const mk = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: 'app' + i, title: 'App ' + String.fromCharCode(65 + (i % 26)) + i, icon: '/x/' + i + '.png' }));

let root: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  launched.length = 0;
  listing = mk(14);
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById('root')!;
  boot(root); // sin hooks: «Más apps» abre la cuadrícula real
});
afterEach(() => { vi.useRealTimers(); });

const grid = () => root.querySelector('.apps') as HTMLElement;
const titles = () => Array.prototype.map.call(root.querySelectorAll('.apps .app .at'), (n: Element) => n.textContent);
const focusedTitle = () => (root.querySelector('.apps .app.focused .at') || { textContent: null }).textContent;
async function openGrid() { press(52); await flush(); }

describe('cuadrícula «Más apps»', () => {
  it('listApps ordena por título con la última app primero', async () => {
    listing = [
      { id: 'z', title: 'Zeta', icon: '' }, { id: 'b', title: 'Beta', icon: '' },
      { id: 'a', title: 'álamo', icon: '' }, { id: 'c', title: 'Gamma', icon: '' },
    ];
    localStorage.setItem('lghome.lastApp', 'c');
    await openGrid();
    expect(titles()).toEqual(['Gamma', 'álamo', 'Beta', 'Zeta']);
    expect(focusedTitle()).toBe('Gamma');
  });

  it('sin última app ordena solo por título', async () => {
    listing = [{ id: 'z', title: 'Zeta', icon: '' }, { id: 'b', title: 'Beta', icon: '' }];
    await openGrid();
    expect(titles()).toEqual(['Beta', 'Zeta']);
  });

  it('Atrás cierra la cuadrícula y devuelve el foco a «Más apps»', async () => {
    await openGrid();
    expect(grid().className).toContain('open');
    press(BACK);
    expect(grid().className).not.toContain('open');
    expect(root.querySelector('.dock .tile.focused .label')!.textContent).toBe('Más apps');
    expect(launched).toEqual([]);
  });

  it('con la cuadrícula abierta las teclas 1-4 se ignoran', async () => {
    await openGrid();
    press(49); press(50); press(51); press(52);
    await flush();
    expect(launched).toEqual([]);
    expect(grid().className).toContain('open');
  });

  it('OK lanza la app enfocada por el mismo camino con bloqueo y cierra', async () => {
    await openGrid();
    press(RIGHT);
    press(OK);
    expect(launched).toEqual(['app1']);
    expect(grid().className).not.toContain('open');
    await settle();
    // el bloqueo de lanzamiento es el de main: un segundo OK inmediato no duplica
    await openGrid();
    press(OK); press(OK);
    expect(launched.length).toBe(2);
  });

  it('flechas: derecha en el fin de fila no salta, abajo en la última fila no se mueve', async () => {
    listing = mk(14); // 6 + 6 + 2
    await openGrid();
    const c = cols();
    expect(c).toBe(6);
    for (let i = 0; i < 10; i++) press(RIGHT);
    expect(focusedTitle()).toBe(titles()[c - 1]); // se queda al final de la primera fila
    press(LEFT);
    expect(focusedTitle()).toBe(titles()[c - 2]);
    press(DOWN);
    expect(focusedTitle()).toBe(titles()[2 * c - 2]);
    press(DOWN); // fila parcial (2 tarjetas): baja a la última
    expect(focusedTitle()).toBe(titles()[13]);
    press(DOWN);
    expect(focusedTitle()).toBe(titles()[13]);
    press(RIGHT); // última tarjeta: no hay más
    expect(focusedTitle()).toBe(titles()[13]);
    press(UP);
    expect(focusedTitle()).toBe(titles()[7]);
    for (let i = 0; i < 5; i++) press(UP);
    expect(focusedTitle()).toBe(titles()[1]);
    for (let i = 0; i < 5; i++) press(LEFT);
    expect(focusedTitle()).toBe(titles()[0]);
  });

  it('si falla la lista muestra el mensaje y Atrás cierra', async () => {
    listing = new Error('boom');
    await openGrid();
    expect(grid().textContent).toContain('No se pudo cargar la lista');
    press(OK); // sin tarjetas: nada que lanzar
    expect(launched).toEqual([]);
    press(BACK);
    expect(grid().className).not.toContain('open');
  });

  it('una lista vacía también avisa', async () => {
    listing = [];
    await openGrid();
    expect(grid().textContent).toContain('No hay más apps');
  });

  it('muestra «Cargando» mientras llega la lista', async () => {
    press(52);
    expect(grid().textContent).toContain('Cargando');
    await flush();
    expect(grid().textContent).not.toContain('Cargando');
  });

  it('Atrás antes de que llegue la lista cierra y la respuesta tardía no reabre nada', async () => {
    press(52);
    press(BACK);
    await flush();
    expect(grid().className).not.toContain('open');
    expect(root.querySelectorAll('.apps .app').length).toBe(0);
  });

  it('Atrás con la cuadrícula cerrada no cambia el comportamiento previo', () => {
    localStorage.setItem('lghome.lastApp', 'spotify-beehive');
    press(BACK);
    expect(launched).toEqual(['spotify-beehive']);
  });

  it('el icono que no carga se sustituye por una letra', async () => {
    listing = [{ id: 'a', title: 'Zorro', icon: '/media/x.png' }];
    await openGrid();
    const img = root.querySelector('.apps .app img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('file:///media/x.png');
    img.dispatchEvent(new Event('error'));
    expect(root.querySelector('.apps .app img')).toBeNull();
    expect(root.querySelector('.apps .app .ic')!.textContent).toBe('Z');
  });

  it('el puntero enfoca al pasar y lanza con clic', async () => {
    await openGrid();
    const t = root.querySelectorAll('.apps .app')[3] as HTMLElement;
    t.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(root.querySelectorAll('.apps .app')[3].className).toContain('focused');
    t.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(launched).toEqual(['app3']);
  });
});
