import { FocusModel } from '../focus';
import { frost } from './scene';

export type ResumeItem = {
  id: string;
  title: string;
  subtitle: string;
  progress: number;
  minutesLeft: number;
  image: string | null;
};

export const MAX_CARDS = 8;

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as { [k: string]: string })[c]);
}

function card(it: ResumeItem, i: number): string {
  const pct = Math.round(Math.min(1, Math.max(0, Number(it.progress) || 0)) * 100);
  const mins = Math.max(0, Math.round(Number(it.minutesLeft) || 0));
  return '<div class="rcard" data-i="' + i + '">' +
    '<div class="rimg' + (it.image ? '' : ' noimg') + '">' +
      (it.image ? '<img src="' + esc(it.image) + '" alt="">' : '') +
      (mins > 0 ? '<span class="rmin">' + mins + ' min</span>' : '') +
      '<div class="rbar"><i style="width:' + pct + '%"></i></div>' +
    '</div>' +
    '<div class="rtxt">' +
      '<div class="rt ell">' + esc(it.title) + '</div>' +
      '<div class="rs ell">' + esc(it.subtitle) + '</div>' +
    '</div>' +
  '</div>';
}

/**
 * Fila «Seguir viendo». `load` pide los elementos al servicio; `onChange` se llama
 * cuando la fila aparece, cambia o desaparece (hay que repintar y realinear el cristal).
 */
export function mountResume(
  el: HTMLElement,
  focus: FocusModel,
  load: () => Promise<ResumeItem[]>,
  onChange: () => void,
): { render(): void; refresh(): Promise<void>; count(): number } {
  el.className = (el.className ? el.className + ' ' : '') + 'resume';
  el.style.display = 'none';
  let cards: NodeListOf<Element> = el.querySelectorAll('.rcard');
  let seq = 0;

  function set(items: ResumeItem[]): void {
    const list = items.slice(0, MAX_CARDS);
    el.innerHTML = list.map(card).join('');
    el.style.display = list.length ? '' : 'none';
    cards = el.querySelectorAll('.rcard');
    for (let i = 0; i < cards.length; i++) {
      frost(cards[i] as HTMLElement);
      const img = cards[i].querySelector('img');
      if (img) {
        img.addEventListener('error', () => {
          const box = img.parentNode as HTMLElement;
          box.className = 'rimg noimg';
          box.removeChild(img);
        });
      }
    }
    // Si la fila desaparece con el foco dentro, mejor las entradas que el volumen.
    if (!list.length && focus.current().zone === 'resume') focus.focus('inputs', 0);
    focus.setSize('resume', list.length);
    onChange();
  }

  return {
    render() {
      const c = focus.current();
      for (let i = 0; i < cards.length; i++) {
        cards[i].className = c.zone === 'resume' && c.index === i ? 'rcard focused' : 'rcard';
      }
    },
    refresh() {
      const my = ++seq;
      return load().then((items) => {
        if (my === seq) set(Array.isArray(items) ? items : []);
      }, () => { /* sin servicio: se deja la fila como estaba */ });
    },
    count: () => cards.length,
  };
}
