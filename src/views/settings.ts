// Ajustes: panel lateral derecho que se abre con el engranaje. Como «Más apps» es una capa modal
// dentro de la app: mientras está abierto se queda con todas las teclas (arriba/abajo cambian de
// opción, izquierda/derecha u OK cambian el valor, OK en la última fila actúa, Atrás cierra).
import { KEYS } from '../config';
import { FocusModel } from '../focus';
import { launchApp, svc } from '../luna';
import { loadSettings, saveSettings, Settings } from '../store';
import { frost } from './scene';

export type SettingsDeps = {
  /** Se llama tras guardar un ajuste (en main: reposo, música y reloj con los valores nuevos). */
  onChange?: () => void;
  /** Lanza una app (en main, por el camino con bloqueo). */
  launch?: (id: string) => void;
  /** Se llama al cerrarse el panel (en main: repinta, porque el foco cambió fuera de la ruta de teclas). */
  onClose?: () => void;
};

export const LG_HOME_ID = 'com.webos.app.fullhome';
export const AFTER_MIN = [1, 3, 5, 10];
/** Índice de la fila de acción (la última) y del engranaje en la zona `top`. */
const ACTION = 4;
export const GEAR_INDEX = 0;

type Row = { label: string; value: string | null; disabled: boolean };

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as { [k: string]: string })[c]);
}

/** Posición de `v` en la lista; si no está (valor de desarrollo), la más cercana. */
function nearest(list: number[], v: number): number {
  let best = 0;
  for (let i = 1; i < list.length; i++) {
    if (Math.abs(list[i] - v) < Math.abs(list[best] - v)) best = i;
  }
  return best;
}

export function mountSettings(el: HTMLElement, focus: FocusModel, deps: SettingsDeps = {}): {
  open(): void;
  close(): void;
  isOpen(): boolean;
  onKey(code: number): void;
} {
  const onChange = deps.onChange || (() => {});
  const onClose = deps.onClose || (() => {});
  const doLaunch = deps.launch || ((id: string) => { launchApp(id).then(() => {}, () => {}); });

  el.className = (el.className ? el.className + ' ' : '') + 'settings';
  el.innerHTML =
    '<div class="settings-scrim"></div>' +
    '<div class="settings-panel">' +
      '<div class="settings-head">Ajustes</div>' +
      '<div class="settings-rows"></div>' +
      '<div class="smsg"></div>' +
      '<div class="sstatus"></div>' +
      '<div class="settings-hint">↑↓ elegir · ←→ cambiar · Atrás cerrar</div>' +
    '</div>';
  const panel = el.querySelector('.settings-panel') as HTMLElement;
  frost(panel);
  const rowsEl = el.querySelector('.settings-rows') as HTMLElement;
  const msgEl = el.querySelector('.smsg') as HTMLElement;
  const statusEl = el.querySelector('.sstatus') as HTMLElement;

  let opened = false;
  let seq = 0;
  let sel = 0;
  let busy = false;
  // Estado del servicio: null = aún no se sabe.
  let svcUp: boolean | null = null;
  let svcRoot = false;
  let svcVersion = '';
  // null = getHome aún no ha contestado (o falló): no se sabe qué ofrecer, la acción queda desactivada.
  let isOurs: boolean | null = null;
  let cfg: Settings = loadSettings();
  let rowEls: HTMLElement[] = [];

  function rows(): Row[] {
    const yn = (b: boolean) => (b ? 'Sí' : 'No');
    return [
      { label: 'Música ambiente', value: yn(cfg.music), disabled: false },
      { label: 'Modo cuadro', value: yn(cfg.pictureMode), disabled: false },
      { label: 'Modo cuadro tras', value: AFTER_MIN[nearest(AFTER_MIN, cfg.pictureAfterMin)] + ' min', disabled: false },
      { label: 'Formato de hora', value: cfg.clock24 ? '24 h' : '12 h', disabled: false },
      { label: isOurs === null ? 'Comprobando…' : isOurs ? 'Volver a la pantalla de LG' : 'Usar LG Home como inicio', value: null, disabled: !(svcUp && svcRoot) || isOurs === null },
    ];
  }

  function paint(): void {
    const rs = rows();
    if (rowEls.length !== rs.length) {
      rowsEl.innerHTML = '';
      rowEls = [];
      for (let i = 0; i < rs.length; i++) {
        const r = document.createElement('div');
        r.setAttribute('data-i', String(i));
        rowsEl.appendChild(r);
        rowEls.push(r);
      }
    }
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      const act = i === ACTION;
      rowEls[i].className = 'srow' + (act ? ' saction' : '') + (r.disabled ? ' disabled' : '') + (i === sel ? ' focused' : '');
      rowEls[i].innerHTML = '<span class="slabel">' + esc(r.label) + '</span>' +
        (r.value !== null ? '<span class="sval">' + esc(r.value) + '</span>' : '');
    }
    statusEl.textContent = svcUp === null ? 'Comprobando el servicio…'
      : !svcUp ? 'Servicio no disponible'
      : svcRoot ? 'Servicio: activo (root)' + (svcVersion ? ' · versión ' + svcVersion : '')
      : 'Servicio: activo (sin root)' + (svcVersion ? ' · versión ' + svcVersion : '');
  }

  function setMsg(t: string): void { msgEl.textContent = t; }

  function loadService(): void {
    const my = seq;
    svcUp = null;
    isOurs = null;
    paint();
    svc<{ root?: boolean; version?: string }>('status').then((r) => {
      if (my !== seq || !opened) return;
      svcUp = true;
      svcRoot = !!(r && r.root === true);
      svcVersion = r && typeof r.version === 'string' ? r.version : '';
      paint();
    }, () => {
      if (my !== seq || !opened) return;
      svcUp = false;
      paint();
    });
    svc<{ isOurs?: boolean }>('getHome').then((r) => {
      if (my !== seq || !opened) return;
      if (r && typeof r.isOurs === 'boolean') isOurs = r.isOurs;
      else setMsg('No se pudo comprobar el inicio');
      paint();
    }, () => {
      if (my !== seq || !opened) return;
      setMsg('No se pudo comprobar el inicio');
    });
  }

  function save(next: Settings): void {
    cfg = next;
    saveSettings(next);
    onChange();
    paint();
  }

  function change(i: number, dir: -1 | 0 | 1): void {
    const n: Settings = { music: cfg.music, pictureMode: cfg.pictureMode, pictureAfterMin: cfg.pictureAfterMin, clock24: cfg.clock24 };
    if (i === 0) n.music = !cfg.music;
    else if (i === 1) n.pictureMode = !cfg.pictureMode;
    else if (i === 2) {
      // Con OK o con → se avanza (y vuelve al principio); con ← se retrocede sin dar la vuelta.
      const at = nearest(AFTER_MIN, cfg.pictureAfterMin);
      const to = dir === -1 ? Math.max(0, at - 1) : dir === 1 ? Math.min(AFTER_MIN.length - 1, at + 1) : (at + 1) % AFTER_MIN.length;
      n.pictureAfterMin = AFTER_MIN[to];
    } else if (i === 3) n.clock24 = !cfg.clock24;
    else return;
    if (n.pictureAfterMin === cfg.pictureAfterMin && n.music === cfg.music && n.pictureMode === cfg.pictureMode && n.clock24 === cfg.clock24) return;
    save(n);
  }

  function act(): void {
    if (busy || svcUp !== true || !svcRoot || isOurs === null) return;
    busy = true;
    setMsg('');
    const my = seq;
    const wasOurs = isOurs;
    svc<unknown>('setHome', { enabled: !wasOurs }).then(() => {
      busy = false;
      if (my !== seq || !opened) return;
      if (wasOurs) {
        close();
        doLaunch(LG_HOME_ID);
      } else {
        isOurs = true;
        setMsg('LG Home vuelve a ser la pantalla de inicio');
        paint();
      }
    }, (e) => {
      busy = false;
      console.warn('setHome: ' + String(e));
      if (my !== seq || !opened) return;
      setMsg('No se pudo cambiar la pantalla de inicio');
    });
  }

  function open(): void {
    if (opened) return;
    opened = true;
    seq++;
    cfg = loadSettings();
    sel = 0;
    busy = false;
    setMsg('');
    el.className = el.className.replace(/\s*\bopen\b/g, '') + ' open';
    loadService();
  }

  function close(): void {
    if (!opened) return;
    opened = false;
    seq++;
    el.className = el.className.replace(/\s*\bopen\b/g, '');
    focus.focus('top', GEAR_INDEX);
    onClose();
  }

  function onKey(code: number): void {
    if (!opened) return;
    if (code === KEYS.BACK) { close(); return; }
    if (code === KEYS.UP) { if (sel > 0) { sel--; paint(); } }
    else if (code === KEYS.DOWN) { if (sel < ACTION) { sel++; paint(); } }
    else if (code === KEYS.LEFT) { if (sel < ACTION) change(sel, -1); }
    else if (code === KEYS.RIGHT) { if (sel < ACTION) change(sel, 1); }
    else if (code === KEYS.OK) { if (sel === ACTION) act(); else change(sel, 0); }
  }

  // Puntero del Magic Remote: pasar por encima enfoca, clic cambia/actúa; clic fuera cierra.
  const find = (t: EventTarget | null): number => {
    let n = t as HTMLElement | null;
    while (n && n !== el) {
      if (n.getAttribute && n.getAttribute('data-i') !== null && n.className.indexOf('srow') === 0) {
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
    if (!opened) return;
    const i = find(e.target);
    if (i >= 0) { sel = i; paint(); onKey(KEYS.OK); }
    else if ((e.target as HTMLElement).className.indexOf('settings-scrim') === 0) close();
  });

  paint();
  return { open, close, isOpen: () => opened, onKey };
}
