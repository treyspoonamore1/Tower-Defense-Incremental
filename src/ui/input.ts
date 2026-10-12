import type { Game } from '../core/game';
import type { SlotRef } from '../core/state';
import type { Renderer, UiState } from '../render/renderer';

export interface InputHost {
  game: Game;
  ui: UiState;
  select(ref: SlotRef | null): void;
  haptic(pattern: number | number[]): void;
}

const DRAG_THRESHOLD = 10; // css px before a press becomes a drag

/** Touch handling for the arena: tap to inspect, drag to merge or move, tap the core for Overdrive. */
export class Input {
  private pending: { from: SlotRef; x: number; y: number; id: number } | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(private canvas: HTMLCanvasElement, private renderer: Renderer, private host: InputHost) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', () => this.cancel());
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  private down(e: PointerEvent): void {
    if (this.pending) return;
    const [x, y] = this.local(e);
    const game = this.host.game;
    const slot = this.renderer.slotAt(game, x, y, Math.max(26, this.renderer.towerRadius() * 1.6));
    if (slot && game.tower(slot)) {
      this.pending = { from: slot, x, y, id: e.pointerId };
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (this.renderer.isCore(x, y)) {
      if (game.overdrive()) this.host.haptic(30);
      return;
    }
    this.host.select(null);
  }

  private move(e: PointerEvent): void {
    if (!this.pending || e.pointerId !== this.pending.id) return;
    const [x, y] = this.local(e);
    this.lastX = x;
    this.lastY = y;
    const ui = this.host.ui;
    if (!ui.drag && Math.hypot(x - this.pending.x, y - this.pending.y) > DRAG_THRESHOLD) {
      ui.drag = { from: this.pending.from, x, y };
      this.host.select(null);
    }
    if (ui.drag) {
      ui.drag.x = x;
      ui.drag.y = y;
      this.refreshHover();
    }
  }

  /** Recomputes the drop target; called on move and every frame, since slots keep orbiting. */
  refreshHover(): void {
    const ui = this.host.ui;
    if (!ui.drag) { ui.hover = null; return; }
    const game = this.host.game;
    const slot = this.renderer.slotAt(game, this.lastX, this.lastY, Math.max(30, this.renderer.towerRadius() * 2));
    const from = ui.drag.from;
    if (!slot || (slot.ring === from.ring && slot.index === from.index)) { ui.hover = null; return; }
    const target = game.tower(slot);
    ui.hover = !target || game.canMerge(from, slot) ? slot : null;
  }

  private up(e: PointerEvent): void {
    if (!this.pending || e.pointerId !== this.pending.id) return;
    const ui = this.host.ui;
    const game = this.host.game;
    if (ui.drag) {
      this.refreshHover();
      const to = ui.hover;
      if (to) {
        if (game.tower(to)) {
          if (game.merge(ui.drag.from, to)) this.host.haptic(18);
        } else {
          game.move(ui.drag.from, to);
        }
      }
    } else {
      this.host.select(this.pending.from);
    }
    this.cancel();
  }

  private cancel(): void {
    this.pending = null;
    this.host.ui.drag = null;
    this.host.ui.hover = null;
  }
}
