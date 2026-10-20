// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/luna', () => ({
  launchApp: () => Promise.resolve(),
  call: () => Promise.reject(new Error('sin bridge')),
  svc: (method: string) => Promise.resolve(method === 'resume' ? { items: [] } : { returnValue: true }),
}));

import { boot } from '../../src/main';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('volumen con respuesta incompleta', () => {
  it('sin volume en la respuesta muestra – y nunca undefined', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    boot(document.getElementById('app')!);
    await flush();
    expect(document.querySelector('.vnum')!.textContent).toBe('–');
    expect(document.body.textContent).not.toContain('undefined');
    expect((document.querySelector('.vfill') as HTMLElement).style.width).toBe('0%');
  });
});
