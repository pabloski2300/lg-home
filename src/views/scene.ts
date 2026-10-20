// Fondo de paisaje a pantalla completa con fundido suave entre fotos.
// En el DOM solo hay, como mucho, la foto actual y la que entra.
// El «cristal» de las tarjetas no usa backdrop-filter (no existe en Chrome 68):
// cada foto tiene una miniatura de 48×27 que, ampliada a 1920×1080 por el
// navegador, queda desenfocada; las piezas de cristal la pintan alineada con
// la pantalla (ver `frost`). Cuesta unos pocos KB de RAM.

export const BACKGROUNDS = ['01', '02', '03', '04', '05', '06'];
const FADE_MS = 2000;
export const ROTATE_MS = 60 * 60 * 1000;

function fullUrl(name: string): string { return 'assets/bg/' + name + '.jpg'; }
function tinyUrl(name: string): string { return 'assets/bg/' + name + '-s.jpg'; }

export function mountScene(root: HTMLElement): {
  setBackground(i: number): void;
  current(): number;
  /** Segundo plano: para la rotación y deja en el DOM solo la foto que se ve. */
  suspend(): void;
  /** Vuelve a primer plano: reanuda la rotación. */
  resume(): void;
  stop(): void;
} {
  root.className = (root.className ? root.className + ' ' : '') + 'scene';
  const shade = document.createElement('div');
  shade.className = 'shade';
  root.appendChild(shade);

  let current = -1;
  let shown = -1; // la foto que de verdad está en pantalla (current puede estar cargando)
  let seq = 0;
  let cleanup: number | undefined;
  let pending: HTMLImageElement | null = null; // foto que se está descargando

  function setFrost(name: string): void {
    const url = 'url(' + tinyUrl(name) + ')';
    document.documentElement.style.setProperty('--frost', url);
  }

  function setBackground(i: number): void {
    const n = BACKGROUNDS.length;
    const idx = ((Math.floor(i) % n) + n) % n;
    if (idx === current) return;
    current = idx;
    const name = BACKGROUNDS[idx];
    const my = ++seq;
    let img: HTMLImageElement | null = new Image();
    pending = img;
    img.onload = img.onerror = () => {
      if (pending === img) pending = null;
      img = null;
      if (my !== seq) return; // llegó otra foto mientras cargaba
      const layer = document.createElement('div');
      layer.className = 'bg';
      layer.style.backgroundImage = 'url(' + fullUrl(name) + ')';
      root.insertBefore(layer, shade);
      void layer.offsetWidth; // fuerza el estilo inicial para que haya transición
      layer.className = 'bg on';
      shown = idx;
      setFrost(name);
      if (cleanup !== undefined) window.clearTimeout(cleanup);
      cleanup = window.setTimeout(() => {
        const olds = root.querySelectorAll('.bg');
        for (let k = 0; k < olds.length; k++) {
          if (olds[k] !== layer) root.removeChild(olds[k]);
        }
      }, FADE_MS + 200);
    };
    img.src = fullUrl(name);
  }

  // La foto inicial depende de la hora, así que también cambia entre arranques.
  setBackground(Math.floor(Date.now() / ROTATE_MS));
  let timer: number | undefined = window.setInterval(() => setBackground(current + 1), ROTATE_MS);

  /** Quita las capas que no son la última (la que se ve o está entrando). */
  function dropHidden(): void {
    const all = root.querySelectorAll('.bg');
    for (let k = 0; k < all.length - 1; k++) root.removeChild(all[k]);
    const last = all[all.length - 1] as HTMLElement | undefined;
    if (last) last.className = 'bg on';
  }

  return {
    setBackground,
    current: () => current,
    suspend() {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
      if (cleanup !== undefined) window.clearTimeout(cleanup);
      cleanup = undefined;
      seq++; // una foto a medio cargar ya no entra
      if (pending) {
        // y se corta su descarga y decodificación
        pending.onload = pending.onerror = null;
        pending.src = '';
        pending = null;
      }
      current = shown;
      dropHidden();
    },
    resume() {
      // Si se suspendió antes de que la primera foto cargase (webOS lanza la app oculta), se pide ahora.
      if (shown < 0) setBackground(Math.floor(Date.now() / ROTATE_MS));
      if (timer === undefined) timer = window.setInterval(() => setBackground(current + 1), ROTATE_MS);
    },
    stop() {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
      if (cleanup !== undefined) window.clearTimeout(cleanup);
      seq++;
    },
  };
}

/** Capa de cristal esmerilado para una pieza fija en pantalla. */
export function frost(el: HTMLElement): void {
  if (el.querySelector('.frost')) return;
  const f = document.createElement('div');
  f.className = 'frost';
  const t = document.createElement('div');
  t.className = 'frost-tint';
  el.insertBefore(t, el.firstChild);
  el.insertBefore(f, t);
  alignFrost(el);
}

/** Realinea todo el cristal (p. ej. cuando la fuente carga y cambia anchos). */
export function alignAllFrost(root: HTMLElement): void {
  const fs = root.querySelectorAll('.frost');
  for (let i = 0; i < fs.length; i++) alignFrost(fs[i].parentNode as HTMLElement);
}

/** Alinea la miniatura ampliada con la pantalla, según la posición del elemento. */
export function alignFrost(el: HTMLElement): void {
  const f = el.querySelector('.frost') as HTMLElement | null;
  if (!f) return;
  // offsetLeft/Top no incluyen el `transform` del foco: la posición de reposo.
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  // el cristal sobresale 40px por cada lado (ver CSS)
  f.style.backgroundPosition = (40 - x) + 'px ' + (40 - y) + 'px';
}
