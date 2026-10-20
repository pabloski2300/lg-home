import { Forecast, loadWeather, wmoIcon, wmoText } from '../weather';
import { frost } from './scene';
import { GEO } from '../config';

export const WEATHER_REFRESH_MS = 30 * 60 * 1000;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function card(f: Forecast): string {
  const days = f.days.map((d) =>
    '<div class="wx-day"><div class="wx-dow">' + d.dow + '</div>' + wmoIcon(d.code) +
    '<div class="wx-dt"><b>' + d.max + '°</b> <span>' + d.min + '°</span></div></div>').join('');
  return '<div class="wx-city">' + esc(GEO.city) + '</div>' +
    '<div class="wx-body">' +
      '<div class="wx-now"><div class="wx-temp">' + f.now.temp + '°</div>' +
        '<div class="wx-txt"><span class="wx-desc">' + wmoText(f.now.code) + '</span><span class="wx-range">' + f.now.max + '° / ' + f.now.min + '°</span></div></div>' +
      '<div class="wx-days">' + days + '</div>' +
    '</div>';
}

/** Tarjeta del tiempo arriba a la izquierda. Se oculta si no hay datos ni caché. */
export function mountWeather(
  el: HTMLElement,
  fetchFn?: Parameters<typeof loadWeather>[0],
  storage?: Parameters<typeof loadWeather>[1],
  onChange?: () => void,
): { stop(): void } {
  el.className = (el.className ? el.className + ' ' : '') + 'weather';
  el.style.display = 'none';
  let timer: number | undefined;
  let stopped = false;

  const refresh = () => {
    if (stopped) return;
    // El siguiente refresco se programa de entrada: ningún fallo puede pararlo.
    timer = window.setTimeout(refresh, WEATHER_REFRESH_MS);
    let p: Promise<Forecast | null>;
    try { p = loadWeather(fetchFn, storage); } catch (e) { p = Promise.resolve(null); }
    p.then((f) => f, () => null).then((f) => {
      if (stopped) return;
      try {
        if (f) {
          el.innerHTML = card(f);
          el.style.display = ''; // visible antes de medir, para alinear bien el cristal
          frost(el);
        } else {
          el.style.display = 'none';
        }
        if (onChange) onChange();
      } catch (e) {
        el.style.display = 'none';
      }
    });
  };
  refresh();

  return {
    stop() {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
    },
  };
}
