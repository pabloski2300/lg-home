// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const launched: string[] = [];
// Si `hold` está activo, el lanzamiento queda pendiente hasta llamar a `releaseAll`.
let hold = false;
const pending: Array<() => void> = [];
const releaseAll = () => { while (pending.length) pending.shift()!(); };
vi.mock('../../src/luna', () => ({
  launchApp: (id: string) => {
    launched.push(id);
    return hold ? new Promise<void>((r) => pending.push(r)) : Promise.resolve();
  },
  call: () => Promise.reject(new Error('sin bridge')),
  svc: () => Promise.reject(new Error('sin bridge')),
}));

import { boot, LAUNCH_COOLDOWN_MS, onKey } from '../../src/main';

const onMoreApps = vi.fn();

function key(code: number, repeat = false): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, repeat });
  Object.defineProperty(e, 'keyCode', { get: () => code });
  return e;
}
const press = (code: number, repeat = false) => onKey(key(code, repeat));
/** Deja terminar el lanzamiento en curso y pasar el margen de seguridad. */
const settle = () => vi.advanceTimersByTimeAsync(LAUNCH_COOLDOWN_MS + 50);

let root: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers();
  launched.length = 0;
  pending.length = 0;
  hold = false;
  onMoreApps.mockClear();
  localStorage.clear();
  document.body.innerHTML = '<div id="root"></div>';
  root = document.getElementById('root')!;
  boot(root, { onMoreApps });
});
afterEach(() => { vi.useRealTimers(); });

describe('dock y entradas', () => {
  it('tecla 1..4 lanza la app de esa posición del dock', async () => {
    press(49); await settle();
    press(50); await settle();
    press(51); await settle();
    expect(launched).toEqual(['youtube.leanback.v4', 'spotify-beehive', 'org.jellyfin.webos']);
    press(52);
    expect(launched.length).toBe(3);
    expect(onMoreApps).toHaveBeenCalledTimes(1);
  });

  it('tecla 7 no hace nada', () => {
    press(55);
    expect(launched).toEqual([]);
    expect(onMoreApps).not.toHaveBeenCalled();
  });

  it('OK en el foco del dock lanza su id', async () => {
    press(13);
    expect(launched).toEqual(['youtube.leanback.v4']);
    await settle();
    press(39); press(39); press(13);
    expect(launched).toEqual(['youtube.leanback.v4', 'org.jellyfin.webos']);
    await settle();
    press(39); press(13);
    expect(launched.length).toBe(2);
    expect(onMoreApps).toHaveBeenCalledTimes(1);
  });

  it('OK en la píldora PC lanza com.webos.app.hdmi2', () => {
    press(38); // arriba: del dock a las entradas
    press(13);
    expect(launched).toEqual(['com.webos.app.hdmi2']);
  });

  it('Atrás con el foco en el dock lanza getLastApp() si existe y no hace nada si es null', async () => {
    press(461);
    expect(launched).toEqual([]);
    localStorage.setItem('lghome.lastApp', 'spotify-beehive');
    press(461);
    expect(launched).toEqual(['spotify-beehive']);
    await settle();
    press(38); // con el foco en las entradas, Atrás no lanza nada
    press(461);
    expect(launched).toEqual(['spotify-beehive']);
  });

  it('cada tarjeta del dock muestra su número 1-4', () => {
    const nums = Array.prototype.map.call(
      root.querySelectorAll('.dock .tile .num'),
      (n: Element) => n.textContent,
    );
    expect(nums).toEqual(['1', '2', '3', '4']);
  });

  it('el foco se refleja en el DOM', () => {
    expect(root.querySelector('.dock .tile.focused .label')!.textContent).toBe('YouTube');
    press(38);
    expect(root.querySelector('.dock .tile.focused')).toBeNull();
    expect(root.querySelector('.inputs .pill.focused')!.textContent).toContain('PC');
  });
});

describe('pulsaciones repetidas', () => {
  it('OK mantenido (repeat) lanza una sola vez', async () => {
    press(13);
    await settle();
    press(13, true); press(13, true); press(13, true);
    expect(launched).toEqual(['youtube.leanback.v4']);
    press(50, true); // número repetido tampoco
    localStorage.setItem('lghome.lastApp', 'spotify-beehive');
    press(461, true); // ni Atrás repetido
    expect(launched).toEqual(['youtube.leanback.v4']);
  });

  it('dos OK seguidos con un lanzamiento pendiente lanzan una sola vez', async () => {
    hold = true;
    press(13);
    press(13);
    press(50);
    expect(launched).toEqual(['youtube.leanback.v4']);
    releaseAll();
    await vi.advanceTimersByTimeAsync(LAUNCH_COOLDOWN_MS - 200);
    press(13); // aún dentro del margen tras terminar
    expect(launched).toEqual(['youtube.leanback.v4']);
    await settle();
    hold = false;
    press(13); // la tecla 2 de antes dejó el foco en Spotify
    expect(launched).toEqual(['youtube.leanback.v4', 'spotify-beehive']);
  });

  it('las flechas con repeat siguen moviendo el foco', () => {
    press(39, true); press(39, true);
    expect(root.querySelector('.dock .tile.focused .label')!.textContent).toBe('Jellyfin');
    press(38, true);
    expect(root.querySelector('.inputs .pill.focused')).not.toBeNull();
  });
});
