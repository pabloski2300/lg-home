import { DOCK } from '../config';
import { FocusModel } from '../focus';
import { frost } from './scene';

// Iconos propios incluidos en la app (los del sistema llegarán con listApps).
export const DOCK_ICONS: { [id: string]: string } = {
  'youtube.leanback.v4': 'assets/icons/youtube.svg',
  'spotify-beehive': 'assets/icons/spotify.svg',
  'org.jellyfin.webos': 'assets/icons/jellyfin.svg',
  '__more__': 'assets/icons/more.svg',
};

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as { [k: string]: string })[c]);
}

export function mountDock(el: HTMLElement, focus: FocusModel): { render(): void } {
  el.className = (el.className ? el.className + ' ' : '') + 'dock';
  el.innerHTML = DOCK.map((app, i) =>
    '<div class="tile" data-i="' + i + '">' +
      '<span class="num">' + (i + 1) + '</span>' +
      '<div class="ic"><img src="' + (DOCK_ICONS[app.id] || DOCK_ICONS.__more__) + '" alt=""></div>' +
      '<div class="label">' + esc(app.title) + '</div>' +
    '</div>').join('');
  const tiles = el.querySelectorAll('.tile');
  frost(el);
  for (let i = 0; i < tiles.length; i++) frost(tiles[i] as HTMLElement);

  return {
    render() {
      const c = focus.current();
      for (let i = 0; i < tiles.length; i++) {
        const on = c.zone === 'dock' && c.index === i;
        tiles[i].className = on ? 'tile focused' : 'tile';
      }
    },
  };
}
