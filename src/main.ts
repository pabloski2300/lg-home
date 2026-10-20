import { AmbientPlayer, decideMusic, MusicState, MUSIC_TRACKS } from './music';
import { DOCK, INPUTS, KEYS, NUM_KEY_MIN } from './config';
import { FocusModel } from './focus';
import { IdleTimer } from './idle';
import { launchApp, svc } from './luna';
import { getLastApp, loadSettings } from './store';
import { mountApps } from './views/apps';
import { mountClock } from './views/clock';
import { mountDock } from './views/dock';
import { mountGear } from './views/gear';
import { mountInputs } from './views/inputs';
import { mountNowPlaying, NowPlaying } from './views/nowplaying';
import { mountResume, ResumeItem } from './views/resume';
import { mountSettings } from './views/settings';
import { mountVolume } from './views/volume';
import { mountWeather } from './views/weather';
import { alignAllFrost, mountScene } from './views/scene';

/** Zona `top`: qué hay en cada índice (tabla explícita; el engranaje de ajustes y el volumen). */
export const TOP = { gear: 0, volume: 1 };
export const TOP_SIZE = 2;

export type Hooks = {
  /** «Más apps» (tecla 4 / OK). Por defecto abre la cuadrícula de apps. */
  onMoreApps?: () => void;
};

const SELF_ID = 'com.lghome.app';
/** Jellyfin no admite deep links (spike, resultado c): OK en una tarjeta solo abre la app. */
const JELLYFIN_ID = 'org.jellyfin.webos';

type App = {
  root: HTMLElement;
  focus: FocusModel;
  hooks: Hooks;
  apps: { open(): void; close(): void; isOpen(): boolean; onKey(code: number): void };
  settings: { open(): void; close(): void; isOpen(): boolean; onKey(code: number): void };
  /** Opciones del reloj: se cambian en vivo desde ajustes. */
  clockOpts: { clock24: boolean };
  views: Array<{ render(): void }>;
  volume: { onKey(dir: 'left' | 'right'): void; pause(): void; resume(): void; stop(): void };
  resume: { refresh(): Promise<void> };
  nowPlaying: { start(): void; stop(): void };
  clock: { refresh(): void; pause(): void };
  scene: { suspend(): void; resume(): void };
  /** Ciclo de vida: un único juego de temporizadores, tanto si hay un boot() como tres relaunch. */
  hidden: boolean;
  picture: boolean;
  idle: IdleTimer | null;
  musicTick: number | undefined;
  stops: Array<() => void>;
};
let app: App | null = null;

/** Tras abrir una app la nuestra pasa a segundo plano: no se admite otro lanzamiento
 *  hasta que el actual termine y pase este margen (evita dobles pulsaciones). */
export const LAUNCH_COOLDOWN_MS = 1000;
let launching = false;
let launchGen = 0;

function launch(id: string): void {
  if (launching) return;
  launching = true;
  musicHold = true;
  updateMusic(); // la música ya está apagada cuando aparece la otra app
  const gen = launchGen;
  const release = () => {
    window.setTimeout(() => { if (gen === launchGen) { launching = false; musicHold = false; updateMusic(); } }, LAUNCH_COOLDOWN_MS);
  };
  launchApp(id).then(release, (e) => {
    console.warn('No se pudo abrir ' + id + ': ' + String(e));
    release();
  });
}

/** Vuelve a pedir «Seguir viendo» (al arrancar y cuando la app vuelve a ser visible). */
export function refreshResume(): Promise<void> {
  return app ? app.resume.refresh() : Promise.resolve();
}

/** Empieza a consultar «Qué suena» (ya y cada 10 s). La Task 13 lo llama cuando la app vuelve a ser visible. */
export function startNowPlaying(): void {
  if (app) app.nowPlaying.start();
}

/** Deja de consultar «Qué suena» (la app ya no es visible). El último dato deja de valer. */
export function stopNowPlaying(): void {
  if (app) app.nowPlaying.stop();
  musicIn.spotifyPlaying = null;
}

/** Música ambiente: estado de entrada. La Task 13 solo actualiza `visible`, `pictureMode` e `idleMs`
 *  con `setMusicInput` (que llama a `updateMusic`). */
export const MUSIC_TICK_MS = 15000;
let audioEl: HTMLAudioElement | null = null;
let player: AmbientPlayer | null = null;
let appStart = Date.now();
let bootLaunch = false;
let musicHold = false; // mientras lanzamos otra app: ni un fundido, silencio ya
const musicIn = { visible: true, spotifyPlaying: null as boolean | null, pictureMode: false, idleMs: 0 };

function getPlayer(): AmbientPlayer | null {
  if (!player) {
    try {
      audioEl = document.createElement('audio');
      player = new AmbientPlayer(audioEl, MUSIC_TRACKS);
    } catch (e) { return null; }
  }
  return player;
}

export function musicState(): MusicState {
  return {
    enabled: loadSettings().music,
    visible: musicIn.visible && !document.hidden && !musicHold,
    spotifyPlaying: musicIn.spotifyPlaying,
    msSinceBoot: bootLaunch ? Date.now() - appStart : null,
    pictureMode: musicIn.pictureMode,
    idleMs: musicIn.idleMs,
  };
}

/** Reevalúa las reglas y aplica el resultado (arranque, nowPlaying, ajustes, tic de 15 s, visibilidad). */
export function updateMusic(): void {
  const s = musicState();
  const d = decideMusic(s);
  // Recién vuelta a primer plano no se sabe si suena Spotify: se espera a «Qué suena» (o a MUSIC_GATE_MS).
  if (musicGate !== undefined && d !== 'stop') return;
  // Sin reproductor creado no hay nada que parar: no lo creamos solo para pararlo.
  const p = d === 'stop' ? player : getPlayer();
  if (p) p.apply(d, !s.visible);
}

export function setMusicInput(p: Partial<{ visible: boolean; pictureMode: boolean; idleMs: number }>): void {
  if (p.visible !== undefined) musicIn.visible = p.visible;
  if (p.pictureMode !== undefined) musicIn.pictureMode = p.pictureMode;
  if (p.idleMs !== undefined) musicIn.idleMs = p.idleMs;
  updateMusic();
}

/* ---------- Modo cuadro y ciclo de vida ---------- */

/** Tras volver a primer plano la música espera la primera respuesta de «Qué suena», como mucho esto. */
export const MUSIC_GATE_MS = 3000;
let musicGate: number | undefined;
/** Momento del último paso a primer plano: un relaunch pegado a él no repite los refrescos. */
let foregroundAt = 0;
const RELAUNCH_DEDUPE_MS = 1000;
/** Mínimo del parámetro de desarrollo `pictureAfterMin` (3 s). */
const DEV_PICTURE_MIN = 0.05;

function closeMusicGate(): void {
  if (musicGate !== undefined) window.clearTimeout(musicGate);
  musicGate = window.setTimeout(() => { musicGate = undefined; updateMusic(); }, MUSIC_GATE_MS);
}

function openMusicGate(): void {
  if (musicGate !== undefined) window.clearTimeout(musicGate);
  musicGate = undefined;
}

/** Duración del fundido del modo cuadro (CSS `.picture`). */
export const PICTURE_FADE_MS = 600;
let lastKeyAt = Date.now();
/** Solo para pruebas en la TV: `{"pictureAfterMin":0.2}` en los parámetros de lanzamiento. */
let devPictureAfterMin: number | null = null;

function applyDevParams(p: any): void {
  if (p && typeof p.pictureAfterMin === 'number' && p.pictureAfterMin > 0 && isFinite(p.pictureAfterMin)) {
    devPictureAfterMin = Math.max(DEV_PICTURE_MIN, p.pictureAfterMin);
  }
}

function pictureAfterMs(): number {
  const s = loadSettings();
  if (!s.pictureMode) return 0; // IdleTimer con 0 no entra nunca en reposo
  return (devPictureAfterMin !== null ? devPictureAfterMin : s.pictureAfterMin) * 60000;
}

function setPicture(on: boolean): void {
  if (!app || app.picture === on) return;
  app.picture = on;
  if (on) app.root.classList.add('picture');
  else app.root.classList.remove('picture');
  setMusicInput({ pictureMode: on, idleMs: on ? Date.now() - lastKeyAt : 0 });
}

/** (Re)crea el temporizador de reposo con los ajustes actuales; nunca hay dos. */
function armIdle(): void {
  if (!app) return;
  if (app.idle) app.idle.stop();
  const idle = new IdleTimer(pictureAfterMs(), () => {
    if (!app || app.idle !== idle) return;
    // Con la cuadrícula «Más apps» o los ajustes abiertos no se entra: se vuelve a contar.
    if (app.apps.isOpen() || app.settings.isOpen()) { idle.poke(); return; }
    setPicture(true);
  }, () => setPicture(false));
  app.idle = idle;
}

/** Ajustes cambiados (lo llama la pantalla de ajustes): reposo y música con los valores nuevos. */
export function applySettings(): void {
  if (!app) return;
  app.clockOpts.clock24 = loadSettings().clock24; // el reloj cambia de formato al momento
  if (app.hidden) return;
  app.clock.refresh();
  armIdle();
  updateMusic();
}

/** Hubo una tecla o se movió el puntero. true = estaba en modo cuadro: solo despierta. */
function activity(): boolean {
  lastKeyAt = Date.now();
  return !!(app && !app.hidden && app.idle && app.idle.poke());
}

function musicTick(): void {
  setMusicInput({ idleMs: musicIn.pictureMode ? Date.now() - lastKeyAt : 0 });
}

function goForeground(): void {
  if (!app || !app.hidden) return;
  app.hidden = false;
  musicIn.visible = true;
  lastKeyAt = Date.now();
  foregroundAt = Date.now();
  closeMusicGate();
  app.clock.refresh();
  app.volume.resume();
  app.scene.resume();
  app.musicTick = window.setInterval(musicTick, MUSIC_TICK_MS);
  armIdle();
  // La música se reevalúa con la primera respuesta de «Qué suena» (y si falla, también) o al
  // vencer MUSIC_GATE_MS: así no suena un instante encima de Spotify.
  app.nowPlaying.start();
  void app.resume.refresh();
}

function goBackground(): void {
  if (!app || app.hidden) return;
  app.hidden = true;
  musicIn.visible = false;
  openMusicGate();
  if (app.idle) app.idle.stop();
  setPicture(false);
  if (app.musicTick !== undefined) window.clearInterval(app.musicTick);
  app.musicTick = undefined;
  stopNowPlaying();
  app.clock.pause();
  app.volume.pause();
  app.scene.suspend(); // solo queda en memoria la foto que se ve
  updateMusic(); // silencio ya, sin fundido
}

/** `visibilitychange`: la app pasa a primer o segundo plano. Idempotente. */
export function onVisibility(visible: boolean): void {
  if (visible) goForeground();
  else goBackground();
}

/** `webOSRelaunch`: Home pulsado con la app ya abierta (en segundo plano o no). Idempotente. */
export function onRelaunch(params?: any): void {
  if (!app) return;
  applyDevParams(params);
  if (app.apps.isOpen()) app.apps.close();
  if (app.settings.isOpen()) app.settings.close();
  app.focus.reset(); // dock, posición 0
  lastKeyAt = Date.now();
  if (app.hidden) {
    // Si aún figura oculta, el `visibilitychange` que llega después lo reanuda todo.
    if (!document.hidden) goForeground();
  } else {
    setPicture(false);
    armIdle();
    app.clock.refresh();
    // Si acaba de volver a primer plano (visibilitychange y luego relaunch) ya se pidió todo.
    if (Date.now() - foregroundAt >= RELAUNCH_DEDUPE_MS) {
      // La música la reevalúa la respuesta de «Qué suena».
      app.nowPlaying.start();
      void app.resume.refresh();
    }
  }
  render();
  openFromParams(params);
}

function render(): void {
  if (!app) return;
  for (let i = 0; i < app.views.length; i++) app.views[i].render();
}

function activate(zone: string, index: number): void {
  if (!app) return;
  if (zone === 'dock') {
    const item = DOCK[index];
    if (!item) return;
    if (item.id === '__more__') {
      if (app.hooks.onMoreApps) app.hooks.onMoreApps();
      else app.apps.open();
    } else {
      launch(item.id);
    }
  } else if (zone === 'top') {
    if (index === TOP.gear) app.settings.open();
  } else if (zone === 'resume') {
    launch(JELLYFIN_ID);
  } else if (zone === 'inputs') {
    const inp = INPUTS[index];
    if (inp) launch(inp.id);
  }
}

const KEY_CURSOR_SHOW = 1536;
const KEY_CURSOR_HIDE = 1537;

export function onKey(e: KeyboardEvent): void {
  if (!app) return;
  // webOS manda 1536/1537 cuando el cursor del Magic Remote aparece o se oculta: no es actividad.
  if (e.keyCode === KEY_CURSOR_SHOW || e.keyCode === KEY_CURSOR_HIDE) return;
  // En modo cuadro la primera tecla (sea cual sea) solo despierta.
  if (activity()) {
    e.preventDefault();
    return;
  }
  const f = app.focus;
  const k = e.keyCode;
  const isNum = k >= NUM_KEY_MIN + 1 && k <= NUM_KEY_MIN + DOCK.length;
  // La repetición automática solo vale para navegar con las flechas.
  if (e.repeat && (k === KEYS.OK || k === KEYS.BACK || isNum)) {
    e.preventDefault();
    return;
  }
  if (app.settings.isOpen()) {
    // Ajustes abiertos: el panel se queda con todas las teclas (1-4 incluidas).
    e.preventDefault();
    app.settings.onKey(k);
    render();
    return;
  }
  if (app.apps.isOpen()) {
    // Cuadrícula «Más apps» abierta: ella se queda con todas las teclas.
    e.preventDefault();
    app.apps.onKey(k);
    render();
    return;
  }
  let handled = true;
  const cur = f.current();
  const onVolume = cur.zone === 'top' && cur.index === TOP.volume;
  if (onVolume && k === KEYS.UP) f.focus('top', TOP.gear); // el engranaje queda justo encima en el orden de foco
  else if (onVolume && (k === KEYS.LEFT || k === KEYS.RIGHT)) app.volume.onKey(k === KEYS.LEFT ? 'left' : 'right');
  else if (k === KEYS.LEFT) f.move('left');
  else if (k === KEYS.RIGHT) f.move('right');
  else if (k === KEYS.UP) f.move('up');
  else if (k === KEYS.DOWN) f.move('down');
  else if (k === KEYS.OK) { const c = f.current(); activate(c.zone, c.index); }
  else if (k === KEYS.BACK) {
    if (f.current().zone === 'dock') {
      const last = getLastApp();
      if (last && last !== SELF_ID) launch(last);
    }
  } else if (isNum) {
    const i = k - NUM_KEY_MIN - 1;
    f.focus('dock', i);
    activate('dock', i);
  } else handled = false;
  if (handled) {
    e.preventDefault();
    render();
  }
}

/** Puntero del Magic Remote: pasar por encima enfoca, clic activa. */
function bindPointer(el: HTMLElement, zone: 'dock' | 'inputs' | 'resume', sel: string): void {
  const find = (t: EventTarget | null): number => {
    let n = t as HTMLElement | null;
    while (n && n !== el) {
      if (n.getAttribute && n.getAttribute('data-i') !== null && n.matches(sel)) {
        return Number(n.getAttribute('data-i'));
      }
      n = n.parentNode as HTMLElement | null;
    }
    return -1;
  };
  el.addEventListener('mouseover', (e) => {
    const i = find(e.target);
    if (i >= 0 && app) { app.focus.focus(zone, i); render(); }
  });
  el.addEventListener('click', (e) => {
    // En modo cuadro `.bottom` no recibe clics (pointer-events: none): suele despertar antes el
    // mousemove. Esto cubre un clic sin movimiento previo.
    if (activity()) return;
    const i = find(e.target);
    if (i >= 0 && app) { app.focus.focus(zone, i); render(); activate(zone, i); }
  });
}

/** Parámetros de lanzamiento de webOS (JSON en PalmSystem.launchParams). */
function readLaunchParams(): any {
  try {
    const ps = (window as any).PalmSystem;
    if (ps && ps.launchParams) return JSON.parse(ps.launchParams);
  } catch (e) { /* sin parámetros */ }
  return {};
}

/** Solo para desarrollo y capturas: `{"open":"apps"}` abre la cuadrícula y `{"open":"settings"}` los ajustes. */
function openFromParams(p: any): void {
  if (!app || !p) return;
  if (p.open === 'apps') { app.apps.open(); render(); }
  else if (p.open === 'settings') { app.settings.open(); render(); }
}

export function boot(root: HTMLElement, hooks: Hooks = {}): void {
  if (app) for (let i = 0; i < app.stops.length; i++) app.stops[i]();
  launching = false;
  musicHold = false;
  launchGen++;
  appStart = Date.now();
  const params = readLaunchParams();
  bootLaunch = params.reason === 'boot';
  devPictureAfterMin = null;
  applyDevParams(params);
  lastKeyAt = Date.now();
  musicIn.spotifyPlaying = null;
  musicIn.pictureMode = false;
  musicIn.idleMs = 0;
  musicIn.visible = false; // goForeground lo pone a true
  root.innerHTML =
    '<div class="scene-root"></div>' +
    '<div class="clock-wrap"></div>' +
    '<div class="weather-wrap"></div>' +
    '<div class="nowplaying-wrap"></div>' +
    '<div class="gear-wrap"><div class="gear-el"></div></div>' +
    '<div class="volume-wrap"><div class="volume-el"></div></div>' +
    '<div class="bottom"><div class="resume-wrap"></div><div class="inputs-wrap"></div><div class="dock-wrap"><div class="dock-el"></div></div></div>' +
    '<div class="apps-el"></div>' +
    '<div class="settings-el"></div>';
  const q = (s: string) => root.querySelector(s) as HTMLElement;

  const focus = new FocusModel(['top', 'resume', 'inputs', 'dock']);
  focus.setSize('top', TOP_SIZE); // engranaje y volumen
  focus.setSize('resume', 0); // se llena al llegar «Seguir viendo»
  focus.setSize('inputs', INPUTS.length);
  focus.setSize('dock', DOCK.length);
  focus.reset();

  const scene = mountScene(q('.scene-root'));
  const clockOpts = { clock24: loadSettings().clock24 };
  const clock = mountClock(q('.clock-wrap'), clockOpts);
  const weather = mountWeather(q('.weather-wrap'), undefined, undefined, () => alignAllFrost(root));
  const resume = mountResume(q('.resume-wrap'), focus,
    () => svc<{ items: ResumeItem[] }>('resume').then((r) => (r && r.items) || []),
    () => { render(); alignAllFrost(root); });
  const nowPlaying = mountNowPlaying(q('.nowplaying-wrap'),
    () => svc<NowPlaying>('nowPlaying'),
    () => alignAllFrost(root),
    (r) => { musicIn.spotifyPlaying = r ? !!r.playing : null; openMusicGate(); updateMusic(); });
  const inputs = mountInputs(q('.inputs-wrap'), focus);
  const dock = mountDock(q('.dock-el'), focus);
  const gear = mountGear(q('.gear-el'), focus, TOP.gear);
  const volume = mountVolume(q('.volume-el'), focus, TOP.volume);
  bindPointer(q('.resume-wrap'), 'resume', '.rcard');
  bindPointer(q('.inputs-wrap'), 'inputs', '.pill');
  bindPointer(q('.dock-el'), 'dock', '.tile');
  q('.volume-wrap').addEventListener('mouseover', () => { if (app) { app.focus.focus('top', TOP.volume); render(); } });
  q('.gear-wrap').addEventListener('mouseover', () => { if (app) { app.focus.focus('top', TOP.gear); render(); } });
  q('.gear-wrap').addEventListener('click', () => {
    if (activity()) return;
    if (app) { app.focus.focus('top', TOP.gear); render(); activate('top', TOP.gear); }
  });

  const apps = mountApps(q('.apps-el'), focus, { launch });
  const settings = mountSettings(q('.settings-el'), focus, { onChange: applySettings, launch, onClose: render });

  // Oyentes globales: se registran aquí y se quitan en el siguiente boot().
  const realign = () => { if (app === a) alignAllFrost(root); };
  const onVis = () => onVisibility(!document.hidden);
  const onRel = (e: any) => {
    let p: any = {};
    try {
      // Solo los del evento: PalmSystem.launchParams puede seguir con los del primer lanzamiento.
      const raw = e && e.detail && e.detail.launchParams;
      p = raw && typeof raw === 'object' ? raw : (typeof raw === 'string' && raw ? JSON.parse(raw) : {});
    } catch (err) { /* sin parámetros */ }
    onRelaunch(p);
  };
  // Chrome manda mousemove sintéticos con el cursor quieto (p. ej. al cambiar lo que hay debajo).
  let mx = -1;
  let my = -1;
  const onMove = (e: MouseEvent) => {
    if (e.screenX === mx && e.screenY === my) return;
    mx = e.screenX;
    my = e.screenY;
    activity();
  };
  const a: App = {
    root, focus, hooks, apps, settings, clockOpts, volume, resume, nowPlaying, clock, scene,
    views: [resume, inputs, dock, gear, volume],
    hidden: true, picture: false, idle: null, musicTick: undefined,
    stops: [],
  };
  a.stops = [
    scene.stop, clock.stop, weather.stop, nowPlaying.stop, volume.stop,
    () => { if (a.musicTick !== undefined) window.clearInterval(a.musicTick); a.musicTick = undefined; },
    () => { if (a.idle) a.idle.stop(); a.idle = null; },
    openMusicGate,
    () => { if (player) player.apply('stop', true); },
    () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('webOSRelaunch', onRel);
      document.removeEventListener('mousemove', onMove);
      window.removeEventListener('load', realign);
    },
  ];
  app = a;
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  document.addEventListener('webOSRelaunch', onRel);
  document.addEventListener('mousemove', onMove);
  window.addEventListener('load', realign);

  render();
  if (!document.hidden) goForeground();
  else { clock.pause(); scene.suspend(); volume.pause(); } // oculto: sin reintentos de volumen hasta el primer visibilitychange
  root.setAttribute('data-ready', '1');
  openFromParams(params);

  // Cuando la fuente termina de cargar cambian los anchos de las píldoras.
  const fonts = (document as any).fonts;
  if (fonts && fonts.ready) fonts.ready.then(realign, () => {});
}

const el = document.getElementById('app');
if (el) boot(el);
