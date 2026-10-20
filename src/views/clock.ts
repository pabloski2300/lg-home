// Reloj y fecha en español.
// Decisión: se usa la hora LOCAL del motor web. La TV ya tiene su reloj en
// su zona horaria, y en Chrome 68 `Intl` puede no traer datos de 'es' ni soporte
// de `timeZone`, así que los nombres de días y meses van escritos aquí.

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

export function formatTime(d: Date, clock24: boolean): string {
  const h = d.getHours();
  const m = pad(d.getMinutes());
  if (clock24) return pad(h) + ':' + m;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return h12 + ':' + m + (h < 12 ? ' a. m.' : ' p. m.');
}

export function formatDate(d: Date): string {
  return DAYS[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
}

export function mountClock(
  el: HTMLElement,
  opts: { clock24: boolean },
  now: () => Date = () => new Date(),
): { refresh(): void; pause(): void; stop(): void } {
  el.className = (el.className ? el.className + ' ' : '') + 'clock';
  el.innerHTML = '<div class="clock-time"></div><div class="clock-date"></div>';
  const time = el.querySelector('.clock-time') as HTMLElement;
  const date = el.querySelector('.clock-date') as HTMLElement;
  let timer: number | undefined;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const d = now();
    const t = formatTime(d, opts.clock24);
    const ds = formatDate(d);
    if (time.textContent !== t) {
      // En 12 h, «a. m./p. m.» va en pequeño y fuera del flujo: las cifras no se desplazan
      // y el reloj no invade la tarjeta del tiempo.
      const m = /^(.*?) ([ap]\. m\.)$/.exec(t);
      if (m) {
        time.textContent = m[1];
        const ap = document.createElement('span');
        ap.className = 'clock-ap';
        ap.textContent = ' ' + m[2];
        time.appendChild(ap);
      } else time.textContent = t;
    }
    if (date.textContent !== ds) date.textContent = ds;
    // Siguiente repintado justo al cambiar de minuto (con un pequeño margen).
    const ms = 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50;
    timer = window.setTimeout(tick, ms);
  };
  tick();

  const clear = () => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = undefined;
  };

  return {
    /** Repinta ya y reprograma (al volver a primer plano el temporizador pudo ir con retraso). */
    refresh() { clear(); tick(); },
    /** Deja de repintar hasta el próximo `refresh` (app en segundo plano). */
    pause: clear,
    stop() {
      stopped = true;
      clear();
    },
  };
}
