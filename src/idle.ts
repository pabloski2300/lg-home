// Temporizador de reposo del modo cuadro: tras `ms` sin teclas llama a `onIdle`;
// la siguiente tecla (`poke`) despierta, llama a `onWake` y devuelve true para que
// esa tecla no haga nada más. Un solo setTimeout vivo como mucho.

export type Timers = {
  setTimeout: (fn: () => void, ms: number) => any;
  clearTimeout: (id: any) => void;
};

/** setTimeout no admite más de 2^31-1 ms (con más, dispara al momento). */
const MAX_DELAY = 2147483647;

const DEFAULT_TIMERS: Timers = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};

export class IdleTimer {
  private timer: any = undefined;
  private since: number | null = null;
  private readonly ms: number;

  constructor(
    ms: number,
    private onIdle: () => void,
    private onWake: () => void,
    private timers: Timers = DEFAULT_TIMERS,
  ) {
    // 0, negativo, NaN o Infinity: nunca entra en reposo.
    this.ms = ms > 0 && isFinite(ms) ? Math.min(ms, MAX_DELAY) : 0;
    this.arm();
  }

  private arm(): void {
    this.clear();
    if (!this.ms) return;
    this.timer = this.timers.setTimeout(() => {
      this.timer = undefined;
      this.since = Date.now();
      this.onIdle();
    }, this.ms);
  }

  private clear(): void {
    if (this.timer !== undefined) this.timers.clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Hubo actividad. Devuelve true si estaba en reposo: la tecla solo despierta. */
  poke(): boolean {
    const wasIdle = this.since !== null;
    this.since = null;
    this.arm();
    if (wasIdle) this.onWake();
    return wasIdle;
  }

  /** Para la cuenta (sin llamar a onWake). Un `poke` posterior la vuelve a armar. */
  stop(): void {
    this.clear();
    this.since = null;
  }

  /** Momento (Date.now()) en que entró en reposo, o null si no lo está. */
  idleSince(): number | null {
    return this.since;
  }
}
