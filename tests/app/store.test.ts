// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { loadSettings, saveSettings, getLastApp, setLastApp } from '../../src/store';

const DEFAULTS = { music: true, pictureMode: true, pictureAfterMin: 3, clock24: true };

beforeEach(() => localStorage.clear());

describe('store', () => {
  it('loadSettings devuelve defaults con localStorage vacío', () => {
    expect(loadSettings()).toEqual(DEFAULTS);
  });
  it('loadSettings devuelve defaults con JSON roto', () => {
    localStorage.setItem('lghome.settings', '{roto');
    expect(loadSettings()).toEqual(DEFAULTS);
  });
  it('saveSettings + loadSettings ida y vuelta', () => {
    const s = { music: false, pictureMode: false, pictureAfterMin: 10, clock24: false };
    saveSettings(s);
    expect(loadSettings()).toEqual(s);
  });
  it('lastApp ida y vuelta', () => {
    expect(getLastApp()).toBeNull();
    setLastApp('abc');
    expect(getLastApp()).toBe('abc');
  });
});
