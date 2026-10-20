import { INPUTS } from '../config';
import { FocusModel } from '../focus';
import { frost } from './scene';

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as { [k: string]: string })[c]);
}

const INPUT_ICONS: { [id: string]: string } = {
  'com.webos.app.hdmi2': 'assets/icons/pc.svg',
  'com.webos.app.hdmi1': 'assets/icons/switch.svg',
};

export function mountInputs(el: HTMLElement, focus: FocusModel): { render(): void } {
  el.className = (el.className ? el.className + ' ' : '') + 'inputs';
  el.innerHTML = INPUTS.map((inp, i) =>
    '<div class="pill" data-i="' + i + '">' +
      (INPUT_ICONS[inp.id] ? '<img class="pi" src="' + INPUT_ICONS[inp.id] + '" alt="">' : '') +
      '<span class="pt">' + esc(inp.title) + '</span>' +
      '<span class="ps">' + esc(inp.sub) + '</span>' +
    '</div>').join('');
  const pills = el.querySelectorAll('.pill');
  for (let i = 0; i < pills.length; i++) frost(pills[i] as HTMLElement);

  return {
    render() {
      const c = focus.current();
      for (let i = 0; i < pills.length; i++) {
        pills[i].className = c.zone === 'inputs' && c.index === i ? 'pill focused' : 'pill';
      }
    },
  };
}
