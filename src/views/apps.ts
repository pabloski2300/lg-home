// «Más apps»: cuadrícula a pantalla completa con el resto de apps instaladas.
// Es una capa modal dentro de la app (no otra app de webOS): mientras está abierta
// las flechas navegan por la cuadrícula, OK lanza y Atrás cierra.
import { DOCK, KEYS } from '../config';
import { FocusModel } from '../focus';
import { launchApp, svc } from '../luna';
import { getLastApp } from '../store';
import { frost } from './scene';

export type AppEntry = { id: string; title: string; icon: string };

export type AppsDeps = {
  fetchApps?: () => Promise<AppEntry[]>;
  /** Lanza una app (en main, por el camino con bloqueo). */
  launch?: (id: string) => void;
};

const COLS = 6;
const CELL_W = 280;
const ROW_H = 260;
const VISIBLE_ROWS = 3;

export function cols(): number { return COLS; }

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as { [k: string]: string })[c]);
}

/** Los iconos llegan como rutas absolutas de la TV: se cargan como file://. */
export function iconUrl(p: string): string {
  if (!p) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return p;
  return p.charAt(0) === '/' ? 'file://' + encodeURI(p) : p;
}

function sortApps(list: AppEntry[], last: string | null): AppEntry[] {
  const sorted = list.slice().sort((a, b) =>
    a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (last) {
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].id === last) { sorted.unshift(sorted.splice(i, 1)[0]); break; }
    }
  }
  return sorted;
}

function defaultFetch(): Promise<AppEntry[]> {
  return svc<{ apps: AppEntry[] }>('listApps').then((r) => (r && r.apps) || []);
}

export function mountApps(el: HTMLElement, focus: FocusModel, deps: AppsDeps = {}): {
  open(): void;
  close(): void;
  isOpen(): boolean;
  onKey(code: number): void;
} {
  const fetchApps = deps.fetchApps || defaultFetch;
  const doLaunch = deps.launch || ((id: string) => { launchApp(id).then(() => {}, () => {}); });
  const moreIndex = Math.max(0, DOCK.map((d) => d.id).indexOf('__more__'));

  el.className = (el.className ? el.className + ' ' : '') + 'apps';
  el.innerHTML =
    '<div class="apps-head">Más apps</div>' +
    '<div class="apps-view"><div class="apps-grid"></div></div>' +
    '<div class="apps-msg"></div>' +
    '<div class="apps-hint">OK abrir · Atrás volver</div>';
  frost(el);
  const gridEl = el.querySelector('.apps-grid') as HTMLElement;
  const msgEl = el.querySelector('.apps-msg') as HTMLElement;

  let opened = false;
  let seq = 0;
  let list: AppEntry[] = [];
  let tiles: HTMLElement[] = [];
  let sel = 0;

  function setMsg(text: string): void { msgEl.textContent = text; }

  function paint(): void {
    for (let i = 0; i < tiles.length; i++) tiles[i].className = i === sel ? 'app focused' : 'app';
    const rows = Math.ceil(tiles.length / COLS);
    const row = Math.floor(sel / COLS);
    const off = Math.max(0, Math.min(row - 1, rows - VISIBLE_ROWS));
    gridEl.style.webkitTransform = gridEl.style.transform = 'translateY(' + (-off * ROW_H) + 'px)';
  }

  function letterTile(ic: HTMLElement, title: string): void {
    ic.innerHTML = '';
    ic.textContent = (title.charAt(0) || '?').toUpperCase();
  }

  function build(): void {
    gridEl.innerHTML = '';
    tiles = [];
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const t = document.createElement('div');
      t.className = 'app';
      t.setAttribute('data-i', String(i));
      t.style.left = (i % COLS) * CELL_W + 'px';
      t.style.top = Math.floor(i / COLS) * ROW_H + 'px';
      t.innerHTML = '<div class="ic"></div><div class="at">' + esc(a.title) + '</div>';
      const ic = t.firstChild as HTMLElement;
      const url = iconUrl(a.icon);
      if (url) {
        const img = document.createElement('img');
        img.alt = '';
        img.addEventListener('error', () => letterTile(ic, a.title));
        img.src = url;
        ic.appendChild(img);
      } else {
        letterTile(ic, a.title);
      }
      gridEl.appendChild(t);
      tiles.push(t);
    }
  }

  function open(): void {
    if (opened) return;
    opened = true;
    const my = ++seq;
    el.className = el.className.replace(/\s*\bopen\b/g, '') + ' open';
    gridEl.innerHTML = '';
    tiles = [];
    list = [];
    sel = 0;
    setMsg('Cargando…');
    fetchApps().then((apps) => {
      if (my !== seq || !opened) return;
      list = sortApps(apps || [], getLastApp());
      sel = 0;
      if (list.length === 0) { setMsg('No hay más apps'); return; }
      setMsg('');
      build();
      paint();
    }, () => {
      if (my !== seq || !opened) return;
      setMsg('No se pudo cargar la lista');
    });
  }

  function close(): void {
    if (!opened) return;
    opened = false;
    seq++;
    el.className = el.className.replace(/\s*\bopen\b/g, '');
    focus.focus('dock', moreIndex);
  }

  function launchSel(i: number): void {
    const a = list[i];
    if (!a) return;
    close();
    doLaunch(a.id);
  }

  function move(dir: 'left' | 'right' | 'up' | 'down'): void {
    const n = list.length;
    if (!n) return;
    let next = sel;
    if (dir === 'left') { if (sel % COLS > 0) next = sel - 1; }
    else if (dir === 'right') { if (sel % COLS < COLS - 1 && sel + 1 < n) next = sel + 1; }
    else if (dir === 'up') { if (sel >= COLS) next = sel - COLS; }
    else if (Math.floor(sel / COLS) < Math.floor((n - 1) / COLS)) next = Math.min(sel + COLS, n - 1);
    if (next !== sel) { sel = next; paint(); }
  }

  /** Teclas con la cuadrícula abierta; todo lo demás (números…) se ignora. */
  function onKey(code: number): void {
    if (!opened) return;
    if (code === KEYS.BACK) close();
    else if (code === KEYS.OK) launchSel(sel);
    else if (code === KEYS.LEFT) move('left');
    else if (code === KEYS.RIGHT) move('right');
    else if (code === KEYS.UP) move('up');
    else if (code === KEYS.DOWN) move('down');
  }

  // Puntero del Magic Remote.
  const find = (t: EventTarget | null): number => {
    let n = t as HTMLElement | null;
    while (n && n !== el) {
      if (n.getAttribute && n.getAttribute('data-i') !== null && n.className.indexOf('app') === 0) {
        return Number(n.getAttribute('data-i'));
      }
      n = n.parentNode as HTMLElement | null;
    }
    return -1;
  };
  el.addEventListener('mouseover', (e) => {
    const i = find(e.target);
    if (opened && i >= 0 && i !== sel) { sel = i; paint(); }
  });
  el.addEventListener('click', (e) => {
    const i = find(e.target);
    if (opened && i >= 0) { sel = i; launchSel(i); }
  });

  return { open, close, isOpen: () => opened, onKey };
}
