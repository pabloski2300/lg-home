import { describe, it, expect } from 'vitest';
import { FocusModel } from '../../src/focus';

function make(): FocusModel {
  const f = new FocusModel(['top', 'resume', 'inputs', 'dock']);
  f.setSize('top', 2);
  f.setSize('resume', 3);
  f.setSize('inputs', 2);
  f.setSize('dock', 5);
  f.reset();
  return f;
}

describe('FocusModel', () => {
  it('reset deja el foco en dock 0', () => {
    const f = make();
    f.focus('top', 1);
    f.reset();
    expect(f.current()).toEqual({ zone: 'dock', index: 0 });
  });

  it('izquierda/derecha se queda dentro de la zona y no sale de los bordes', () => {
    const f = make();
    expect(f.move('left')).toBe(false);
    expect(f.current()).toEqual({ zone: 'dock', index: 0 });
    for (let i = 0; i < 4; i++) expect(f.move('right')).toBe(true);
    expect(f.move('right')).toBe(false);
    expect(f.current()).toEqual({ zone: 'dock', index: 4 });
  });

  it('arriba desde dock salta a inputs', () => {
    const f = make();
    expect(f.move('up')).toBe(true);
    expect(f.current().zone).toBe('inputs');
  });

  it('salta zonas vacías', () => {
    const f = make();
    f.setSize('resume', 0);
    f.focus('inputs', 0);
    expect(f.move('up')).toBe(true);
    expect(f.current().zone).toBe('top');
    expect(f.move('down')).toBe(true);
    expect(f.current().zone).toBe('inputs');
  });

  it('al cambiar de zona conserva un índice válido', () => {
    const f = make();
    f.focus('dock', 3);
    f.move('up');
    expect(f.current()).toEqual({ zone: 'inputs', index: 1 });
  });

  it('move devuelve false en el borde', () => {
    const f = make();
    expect(f.move('down')).toBe(false);
    f.focus('top', 0);
    expect(f.move('up')).toBe(false);
  });

  it('100 movimientos seguidos no dejan índices fuera de rango', () => {
    const f = make();
    const dirs = ['up', 'right', 'down', 'left', 'right', 'right', 'up'] as const;
    for (let i = 0; i < 100; i++) {
      f.move(dirs[i % dirs.length]);
      const c = f.current();
      const size = { top: 2, resume: 3, inputs: 2, dock: 5 }[c.zone];
      expect(c.index).toBeGreaterThanOrEqual(0);
      expect(c.index).toBeLessThan(size);
    }
    for (let i = 0; i < 100; i++) f.move('up');
    expect(f.current().zone).toBe('top');
  });

  it('setSize que encoge la zona actual recoloca el índice', () => {
    const f = make();
    f.focus('dock', 4);
    f.setSize('dock', 2);
    expect(f.current()).toEqual({ zone: 'dock', index: 1 });
  });

  it('si la zona actual se vacía, current pasa a una zona no vacía', () => {
    const f = make();
    f.setSize('dock', 0);
    expect(f.current().zone).toBe('inputs');
  });

  it('con todas las zonas vacías current no cambia y move devuelve false', () => {
    const f = make();
    f.focus('inputs', 1);
    for (const z of ['top', 'resume', 'dock', 'inputs'] as const) f.setSize(z, 0);
    expect(f.current()).toEqual({ zone: 'inputs', index: 1 });
    expect(f.move('up')).toBe(false);
    expect(f.move('left')).toBe(false);
  });
});
