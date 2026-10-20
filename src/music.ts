export type MusicState = {
  enabled: boolean;
  visible: boolean;
  /** true solo si la última respuesta de «Qué suena» dice que suena; null = sin dato. */
  spotifyPlaying: boolean | null;
  /** ms desde el arranque de la TV (solo si la app se lanzó con reason 'boot'); null = no aplica. */
  msSinceBoot: number | null;
  pictureMode: boolean;
  /** ms sin teclas. */
  idleMs: number;
};
export type MusicDecision = 'play' | 'quiet' | 'stop';

export const MUSIC_BOOT_QUIET_MS = 60000;
export const MUSIC_PICTURE_STOP_MS = 30 * 60000;
export const MUSIC_FADE_MS = 1500;
export const VOL_PLAY = 0.25;
export const VOL_QUIET = 0.08;
const FADE_STEP_MS = 50;

export function decideMusic(s: MusicState): MusicDecision {
  if (!s.enabled || !s.visible) return 'stop';
  if (s.spotifyPlaying === true) return 'stop';
  if (s.msSinceBoot !== null && s.msSinceBoot < MUSIC_BOOT_QUIET_MS) return 'stop';
  if (s.pictureMode) return s.idleMs >= MUSIC_PICTURE_STOP_MS ? 'stop' : 'quiet';
  return 'play';
}

/** Un único <audio>, fundidos con setInterval (sin Web Audio), orden aleatorio sin repetir la pista anterior. */
export class AmbientPlayer {
  private target = 0;
  private fade: number | undefined;
  private current = -1;
  private wantPlaying = false;
  private failures = 0;
  private gaveUp = false;

  constructor(private audio: HTMLAudioElement, private tracks: string[]) {
    audio.preload = 'none';
    audio.loop = false;
    audio.volume = 0;
    audio.addEventListener('ended', () => { if (this.wantPlaying) this.next(); });
    audio.addEventListener('playing', () => { this.failures = 0; });
    // Pista ilegible: se salta a la siguiente; si fallan todas seguidas se deja de intentar.
    audio.addEventListener('error', () => {
      if (!this.wantPlaying) return;
      this.failures++;
      if (this.failures >= this.tracks.length) { this.wantPlaying = false; this.gaveUp = true; return; }
      this.next();
    });
  }

  private pick(): number {
    const n = this.tracks.length;
    if (n <= 1) return 0;
    if (this.current < 0) return Math.min(n - 1, Math.floor(Math.random() * n));
    let i = Math.floor(Math.random() * (n - 1));
    if (i >= this.current) i++; // salta la actual
    return Math.min(i, n - 1);
  }

  private next(): void {
    if (!this.tracks.length) return;
    this.current = this.pick();
    this.audio.src = this.tracks[this.current];
    this.start();
  }

  private start(): void {
    try {
      const p = this.audio.play() as any;
      if (p && p.catch) p.catch(() => { /* autoplay bloqueado o pista sin cargar */ });
    } catch (e) { /* sin audio */ }
  }

  private fadeTo(v: number, done?: () => void): void {
    if (this.fade !== undefined) window.clearInterval(this.fade);
    this.fade = undefined;
    const a = this.audio;
    const from = a.volume;
    if (from === v || MUSIC_FADE_MS <= 0) { a.volume = v; if (done) done(); return; }
    const steps = Math.max(1, Math.round(MUSIC_FADE_MS / FADE_STEP_MS));
    let k = 0;
    this.fade = window.setInterval(() => {
      k++;
      const x = k >= steps ? v : from + (v - from) * (k / steps);
      a.volume = Math.max(0, Math.min(1, x));
      if (k >= steps) {
        window.clearInterval(this.fade);
        this.fade = undefined;
        if (done) done();
      }
    }, FADE_STEP_MS);
  }

  /** `immediate`: sin fundido (volumen 0 y pause() síncrono); para cuando la app deja de verse. */
  apply(d: MusicDecision, immediate?: boolean): void {
    if (d === 'stop') {
      this.wantPlaying = false;
      if (immediate || this.audio.paused) {
        if (this.fade !== undefined) window.clearInterval(this.fade);
        this.fade = undefined;
        this.audio.volume = 0;
        if (!this.audio.paused) this.audio.pause();
        return;
      }
      this.fadeTo(0, () => { if (!this.wantPlaying) this.audio.pause(); });
      return;
    }
    const vol = d === 'play' ? VOL_PLAY : VOL_QUIET;
    if (!this.wantPlaying) this.failures = 0;
    if (this.gaveUp) {
      // Tras rendirse el elemento puede seguir con paused=false: se empieza de cero aunque no esté en pausa.
      this.gaveUp = false;
      this.failures = 0;
      this.wantPlaying = true;
      this.next();
      this.fadeTo(vol);
      return;
    }
    this.wantPlaying = true;
    if (this.audio.paused) {
      if (this.current < 0 || !this.audio.getAttribute('src')) this.next();
      else this.start();
    }
    this.fadeTo(vol);
  }
}

export const MUSIC_TRACKS = ['assets/music/01.mp3', 'assets/music/02.mp3', 'assets/music/03.mp3'];
