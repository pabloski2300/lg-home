// Control de volumen: píldora de cristal con altavoz + barra. Con el foco,
// izquierda/derecha bajan/suben un paso. Consulta la TV al arrancar, al volver
// a primer plano y al ganar el foco; solo reintenta (con espera creciente) mientras no haya dato válido.
import { svc } from '../luna';
import { FocusModel } from '../focus';
import { frost } from './scene';

const RETRY_MS = [2000, 5000, 10000, 30000];

export type VolumeState = { volume: number; muted: boolean };
export type VolumeDeps = {
  /** Llamada al servicio; por defecto `volume` de com.lghome.app.service. */
  call?: (action: 'get' | 'up' | 'down' | 'set', value?: number) => Promise<VolumeState>;
};

const SPEAKER =
  '<svg class="vi" viewBox="0 0 24 24" width="30" height="30"><path fill="#fff" d="M3 9v6h4l5 4V5L7 9H3z"/>' +
  '<path class="vw" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"/>' +
  '<path class="vx" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" d="M16 9l5 6M21 9l-5 6"/></svg>';

/** Solo se acepta un volumen finito 0..100; cualquier otra respuesta se trata como «sin dato». */
function valid(r: any): VolumeState | null {
  const v = r && r.volume;
  if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 100) return null;
  return { volume: v, muted: r.muted === true };
}

export function mountVolume(
  el: HTMLElement,
  focus: FocusModel,
  index: number,
  deps: VolumeDeps = {},
): { render(): void; onKey(dir: 'left' | 'right'): void; refresh(): void; pause(): void; resume(): void; stop(): void } {
  const call = deps.call || ((action, value) =>
    svc<VolumeState>('volume', value === undefined ? { action } : { action, value }));
  el.className = (el.className ? el.className + ' ' : '') + 'volume';
  el.innerHTML = SPEAKER + '<div class="vbar"><div class="vfill"></div></div><span class="vnum"></span>';
  frost(el);
  const fill = el.querySelector('.vfill') as HTMLElement;
  const num = el.querySelector('.vnum') as HTMLElement;
  let state: VolumeState | null = null;
  let hadFocus = false;
  let busy = false;
  let seq = 0;
  let active = true;
  let retryTimer: number | undefined;
  let attempt = 0;

  function clearRetry(): void {
    if (retryTimer !== undefined) { window.clearTimeout(retryTimer); retryTimer = undefined; }
  }
  /** Sin dato válido (el servicio aún arrancaba): reintenta 2 s, 5 s, 10 s y luego cada 30 s mientras sea visible. */
  function scheduleRetry(): void {
    clearRetry();
    if (!active) return;
    const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
    attempt++;
    retryTimer = window.setTimeout(() => { retryTimer = undefined; if (active) refresh(); }, delay);
  }

  function show(): void {
    const v = state ? state.volume : 0;
    const muted = !!(state && state.muted);
    fill.style.width = Math.max(0, Math.min(100, v)) + '%';
    num.textContent = state ? String(v) : '–';
    const cls = 'volume' + (muted ? ' muted' : '') + (focus.current().zone === 'top' && focus.current().index === index ? ' focused' : '');
    el.className = cls;
  }
  function apply(p: Promise<VolumeState>): void {
    const mine = ++seq;
    p.then((r) => {
      if (mine !== seq) return;
      state = valid(r);
      show();
      if (state) { attempt = 0; clearRetry(); } else scheduleRetry();
    }, (e) => {
      console.warn('Volumen: ' + String(e));
      if (mine === seq && !state) scheduleRetry();
    });
  }
  function refresh(): void { apply(call('get')); }

  refresh();
  return {
    refresh,
    pause() { active = false; clearRetry(); },
    resume() { active = true; attempt = 0; refresh(); },
    stop() { active = false; clearRetry(); },
    onKey(dir) {
      // Una orden a la vez: la repetición de tecla no apila llamadas.
      if (busy) return;
      busy = true;
      const p = call(dir === 'left' ? 'down' : 'up');
      const done = () => { busy = false; };
      p.then(done, done);
      apply(p);
    },
    render() {
      const c = focus.current();
      const has = c.zone === 'top' && c.index === index;
      if (has && !hadFocus) refresh();
      hadFocus = has;
      show();
    },
  };
}
