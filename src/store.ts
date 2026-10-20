export type Settings = {
  music: boolean;
  pictureMode: boolean;
  pictureAfterMin: number;
  clock24: boolean;
};

const SETTINGS_KEY = 'lghome.settings';
const LAST_APP_KEY = 'lghome.lastApp';

const DEFAULTS: Settings = { music: true, pictureMode: true, pictureAfterMin: 3, clock24: true };

export function loadSettings(): Settings {
  const out: Settings = { music: DEFAULTS.music, pictureMode: DEFAULTS.pictureMode, pictureAfterMin: DEFAULTS.pictureAfterMin, clock24: DEFAULTS.clock24 };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return out;
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object') return out;
    if (typeof p.music === 'boolean') out.music = p.music;
    if (typeof p.pictureMode === 'boolean') out.pictureMode = p.pictureMode;
    if (typeof p.pictureAfterMin === 'number' && isFinite(p.pictureAfterMin)) out.pictureAfterMin = p.pictureAfterMin;
    if (typeof p.clock24 === 'boolean') out.clock24 = p.clock24;
  } catch (e) {
    /* JSON roto o sin localStorage: defaults */
  }
  return out;
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* sin almacenamiento */ }
}

export function getLastApp(): string | null {
  try { return localStorage.getItem(LAST_APP_KEY); } catch (e) { return null; }
}

export function setLastApp(id: string): void {
  try { localStorage.setItem(LAST_APP_KEY, id); } catch (e) { /* sin almacenamiento */ }
}
