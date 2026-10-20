// Modelo de foco por zonas (sin DOM). Las zonas se listan de arriba abajo.
export type Zone = 'top' | 'resume' | 'inputs' | 'dock';
export type Dir = 'up' | 'down' | 'left' | 'right';

export class FocusModel {
  private order: Zone[];
  private sizes: { [zone: string]: number } = {};
  private zone: Zone;
  private index = 0;

  constructor(order: Zone[]) {
    this.order = order.slice();
    this.zone = order[order.length - 1];
  }

  setSize(zone: Zone, n: number): void {
    this.sizes[zone] = Math.max(0, Math.floor(n) || 0);
    this.settle();
  }

  current(): { zone: Zone; index: number } {
    this.settle();
    return { zone: this.zone, index: this.index };
  }

  move(dir: Dir): boolean {
    this.settle();
    if (this.size(this.zone) === 0) return false;
    if (dir === 'left' || dir === 'right') {
      const next = this.index + (dir === 'left' ? -1 : 1);
      if (next < 0 || next >= this.size(this.zone)) return false;
      this.index = next;
      return true;
    }
    const step = dir === 'up' ? -1 : 1;
    for (let i = this.order.indexOf(this.zone) + step; i >= 0 && i < this.order.length; i += step) {
      const n = this.size(this.order[i]);
      if (n > 0) {
        this.zone = this.order[i];
        this.index = Math.min(this.index, n - 1);
        return true;
      }
    }
    return false;
  }

  focus(zone: Zone, index = 0): void {
    this.zone = zone;
    this.index = Math.max(0, Math.floor(index) || 0);
    this.settle();
  }

  reset(): void {
    this.focus(this.order[this.order.length - 1], 0);
  }

  private size(zone: Zone): number {
    return this.sizes[zone] || 0;
  }

  // Deja zona/índice válidos: si la zona actual está vacía se pasa a la
  // no vacía más cercana (a igualdad, la de arriba); si todas están vacías no se toca.
  private settle(): void {
    if (this.size(this.zone) === 0) {
      const at = this.order.indexOf(this.zone);
      for (let d = 1; d < this.order.length; d++) {
        const cand = [this.order[at - d], this.order[at + d]];
        const hit = cand.filter(z => z !== undefined && this.size(z) > 0)[0];
        if (hit) { this.zone = hit; break; }
      }
    }
    const n = this.size(this.zone);
    if (n > 0) this.index = Math.min(Math.max(this.index, 0), n - 1);
  }
}
