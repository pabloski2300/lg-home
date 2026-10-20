import { frost } from './scene';

export const NOWPLAYING_POLL_MS = 10000;

export type NowPlaying = { playing: boolean; title?: string; artist?: string; image?: string | null };

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as { [k: string]: string })[c]);
}

/**
 * Esquina inferior izquierda: portada, canción y artista de lo que suena en Spotify.
 * Solo se muestra (no enfocable) mientras `playing`. `start` consulta ya y luego cada
 * 10 s; `stop` para las consultas (la app lo llama al dejar de ser visible).
 */
export function mountNowPlaying(
  el: HTMLElement,
  load: () => Promise<NowPlaying>,
  onChange: () => void,
  /** Se llama con cada respuesta vigente (null si la consulta falló). */
  onResult?: (r: NowPlaying | null) => void,
): { start(): void; stop(): void; refresh(): Promise<void> } {
  el.className = (el.className ? el.className + ' ' : '') + 'nowplaying';
  el.style.display = 'none';
  let timer: number | undefined;
  let seq = 0;
  let key = '';

  function set(r: NowPlaying | null): void {
    if (!r || !r.playing) {
      key = '';
      el.style.display = 'none';
      return;
    }
    const k = [r.title, r.artist, r.image].join('\n');
    if (k !== key || el.style.display === 'none') {
      key = k;
      el.innerHTML =
        '<div class="np-img' + (r.image ? '' : ' noimg') + '">' + (r.image ? '<img src="' + esc(r.image) + '" alt="">' : '') + '</div>' +
        '<div class="np-txt"><div class="np-t ell">' + esc(r.title || '') + '</div><div class="np-a ell">' + esc(r.artist || '') + '</div></div>';
      const img = el.querySelector('img');
      if (img) {
        img.addEventListener('error', () => {
          const box = img.parentNode as HTMLElement;
          box.className = 'np-img noimg';
          box.removeChild(img);
        });
      }
      el.style.display = ''; // visible antes de medir, para alinear bien el cristal
      frost(el);
    }
    onChange();
  }

  function refresh(): Promise<void> {
    const my = ++seq;
    let p: Promise<NowPlaying>;
    try { p = load(); } catch (e) { p = Promise.reject(e); }
    return p.then((r) => r, () => null).then((r) => { if (my === seq) { set(r); if (onResult) onResult(r); } });
  }

  function stop(): void {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
    seq++; // una respuesta en vuelo ya no cuenta
  }

  return {
    start() {
      stop();
      void refresh();
      timer = window.setInterval(() => { void refresh(); }, NOWPLAYING_POLL_MS);
    },
    stop,
    refresh,
  };
}
