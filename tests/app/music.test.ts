// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AmbientPlayer, decideMusic, MusicState, MUSIC_FADE_MS, VOL_PLAY, VOL_QUIET } from '../../src/music';

const base: MusicState = { enabled: true, visible: true, spotifyPlaying: false, msSinceBoot: null, pictureMode: false, idleMs: 0 };
const st = (o: Partial<MusicState>): MusicState => Object.assign({}, base, o);

describe('decideMusic', () => {
  it('desactivada -> stop', () => expect(decideMusic(st({ enabled: false }))).toBe('stop'));
  it('no visible -> stop', () => expect(decideMusic(st({ visible: false }))).toBe('stop'));
  it('Spotify sonando -> stop', () => expect(decideMusic(st({ spotifyPlaying: true }))).toBe('stop'));
  it('Spotify sin dato (null) no bloquea', () => expect(decideMusic(st({ spotifyPlaying: null }))).toBe('play'));
  it('primer minuto tras encender -> stop', () => {
    expect(decideMusic(st({ msSinceBoot: 59999 }))).toBe('stop');
    expect(decideMusic(st({ msSinceBoot: 60000 }))).toBe('play');
  });
  it('modo cuadro con 30 min sin teclas -> stop', () => {
    expect(decideMusic(st({ pictureMode: true, idleMs: 30 * 60000 }))).toBe('stop');
  });
  it('modo cuadro -> quiet', () => expect(decideMusic(st({ pictureMode: true, idleMs: 5 * 60000 }))).toBe('quiet'));
  it('normal -> play', () => expect(decideMusic(st({}))).toBe('play'));
});

describe('AmbientPlayer', () => {
  let audio: HTMLAudioElement;
  let playSpy: ReturnType<typeof vi.fn>;
  let pauseSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    audio = document.createElement('audio');
    document.body.appendChild(audio);
    let paused = true;
    playSpy = vi.fn(() => { paused = false; return Promise.resolve(); });
    pauseSpy = vi.fn(() => { paused = true; });
    (audio as any).play = playSpy;
    (audio as any).pause = pauseSpy;
    Object.defineProperty(audio, 'paused', { get: () => paused });
  });
  afterEach(() => vi.useRealTimers());

  it("apply('stop') pausa y no crea un segundo <audio>", () => {
    const p = new AmbientPlayer(audio, ['a.mp3', 'b.mp3']);
    p.apply('play');
    vi.advanceTimersByTime(MUSIC_FADE_MS + 200);
    expect(audio.volume).toBeCloseTo(VOL_PLAY, 2);
    p.apply('stop');
    vi.advanceTimersByTime(MUSIC_FADE_MS + 200);
    expect(pauseSpy).toHaveBeenCalled();
    expect(audio.paused).toBe(true);
    expect(document.querySelectorAll('audio').length).toBe(1);
  });

  it('quiet baja el volumen sin pausar', () => {
    const p = new AmbientPlayer(audio, ['a.mp3']);
    p.apply('play');
    vi.advanceTimersByTime(MUSIC_FADE_MS + 200);
    p.apply('quiet');
    vi.advanceTimersByTime(MUSIC_FADE_MS + 200);
    expect(audio.volume).toBeCloseTo(VOL_QUIET, 2);
    expect(audio.paused).toBe(false);
  });

  it('pasa a la siguiente pista al terminar, sin repetir la misma', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const p = new AmbientPlayer(audio, ['a.mp3', 'b.mp3', 'c.mp3']);
    p.apply('play');
    const first = audio.getAttribute('src');
    for (let i = 0; i < 6; i++) {
      const before = audio.getAttribute('src');
      audio.dispatchEvent(new Event('ended'));
      expect(audio.getAttribute('src')).not.toBe(before);
    }
    expect(first).toBeTruthy();
    vi.restoreAllMocks();
  });

  it('con una sola pista la repite', () => {
    const p = new AmbientPlayer(audio, ['a.mp3']);
    p.apply('play');
    audio.dispatchEvent(new Event('ended'));
    expect(audio.getAttribute('src')).toBe('a.mp3');
    expect(playSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('AmbientPlayer: parada inmediata y errores', () => {
  let audio: HTMLAudioElement;
  let paused: boolean;
  beforeEach(() => {
    vi.useFakeTimers();
    audio = document.createElement('audio');
    paused = true;
    (audio as any).play = vi.fn(() => { paused = false; return Promise.resolve(); });
    (audio as any).pause = vi.fn(() => { paused = true; });
    Object.defineProperty(audio, 'paused', { get: () => paused });
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("apply('stop', true) pausa en el acto, sin fundido pendiente", () => {
    const p = new AmbientPlayer(audio, ['a.mp3', 'b.mp3']);
    p.apply('play');
    vi.advanceTimersByTime(300); // a mitad del fundido
    p.apply('stop', true);
    expect(paused).toBe(true);
    expect(audio.volume).toBe(0);
    vi.advanceTimersByTime(MUSIC_FADE_MS + 200); // un fundido colgado no debe tocar el volumen
    expect(audio.volume).toBe(0);
  });

  it('error: salta a la siguiente pista, no repite la rota', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const p = new AmbientPlayer(audio, ['a.mp3', 'b.mp3', 'c.mp3']);
    p.apply('play');
    const first = audio.getAttribute('src');
    audio.dispatchEvent(new Event('error'));
    expect(audio.getAttribute('src')).not.toBe(first);
  });

  it('error en todas las pistas seguidas: deja de intentarlo', () => {
    const p = new AmbientPlayer(audio, ['a.mp3', 'b.mp3', 'c.mp3']);
    p.apply('play');
    const plays = () => (audio.play as any).mock.calls.length;
    for (let i = 0; i < 10; i++) audio.dispatchEvent(new Event('error'));
    const n = plays();
    audio.dispatchEvent(new Event('error'));
    expect(plays()).toBe(n);
    expect(n).toBeLessThanOrEqual(3);
  });

  it('tras rendirse, un nuevo play empieza una pista nueva aunque paused sea false', () => {
    const p = new AmbientPlayer(audio, ['a.mp3', 'b.mp3']);
    p.apply('play');
    audio.dispatchEvent(new Event('error'));
    audio.dispatchEvent(new Event('error'));
    paused = false; // el elemento roto no quedó en pausa
    const before = (audio.play as any).mock.calls.length;
    p.apply('play');
    expect((audio.play as any).mock.calls.length).toBe(before + 1);
    audio.dispatchEvent(new Event('error')); // vuelve a contar desde cero: salta, no se rinde
    expect((audio.play as any).mock.calls.length).toBe(before + 2);
  });
});
