// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { formatDate, formatTime, mountClock } from '../../src/views/clock';

// La TV ya trae la hora local; el reloj usa la hora local del
// motor, así que construimos las fechas con el constructor local.
const LUNES = () => new Date(2025, 9, 20, 21, 47, 5); // lunes, 20 de octubre de 2025

let stop: (() => void) | null = null;
afterEach(() => { if (stop) stop(); stop = null; document.body.innerHTML = ''; });

describe('reloj', () => {
  it('formatea 21:47 y «lunes, 20 de octubre»', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    stop = mountClock(el, { clock24: true }, LUNES).stop;
    expect(el.querySelector('.clock-time')!.textContent).toBe('21:47');
    expect(el.querySelector('.clock-date')!.textContent).toBe('lunes, 20 de octubre');
  });

  it('formato 12 h → 9:47 p. m.', () => {
    expect(formatTime(LUNES(), false)).toBe('9:47 p. m.');
    expect(formatTime(new Date(2025, 9, 20, 0, 5), false)).toBe('12:05 a. m.');
    expect(formatTime(new Date(2025, 9, 20, 12, 0), false)).toBe('12:00 p. m.');
    expect(formatTime(new Date(2025, 9, 20, 7, 3), true)).toBe('07:03');
  });

  it('nombres de día y mes en español sin depender de Intl', () => {
    expect(formatDate(new Date(2026, 0, 1))).toBe('jueves, 1 de enero');
    expect(formatDate(new Date(2026, 4, 3))).toBe('domingo, 3 de mayo');
  });

  it('12 h: el sufijo va en un span aparte y el texto completo se mantiene', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    stop = mountClock(el, { clock24: false }, LUNES).stop;
    const t = el.querySelector('.clock-time')!;
    expect(t.textContent).toBe('9:47 p. m.');
    expect(t.querySelector('.clock-ap')!.textContent!.trim()).toBe('p. m.');
  });
});
