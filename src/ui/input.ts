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

const same = (a: SlotRef | null, b: SlotRef | null) => !!a && !!b && a.ring === b.ring && a.index === b.index;

/**
 * Touch handling for the arena.
 * - Drag a tower onto a matching tower to merge (drops snap to the nearest match), or onto an empty slot to move.
 * - Tap a tower to select it; then tap a highlighted match to merge into it.
 * - Tap the core for Overdrive.
 * Rings slow down while a tower is held or selected, so targets are easy to hit.
 */
export class Input {
  private pending: { from: SlotRef; x: number; y: number; id: number; tapMergeInto: SlotRef | null } | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(private canvas: HTMLCanvasElement, private renderer: Renderer, private host: InputHost) {
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', () => this.cancel());
  }

  /** True while a finger is on a tower. */
  get holding(): boolean {
    return this.pending !== null;
  }

  private local(e: PointerEvent): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  /** The tower slot under a point. Towers win over empty slots. */
  private towerAt(x: number, y: number, radius: number): SlotRef | null {
    const slot = this.renderer.slotAt(this.host.game, x, y, radius);
    return slot && this.host.game.tower(slot) ? slot : null;
  }

  /** The nearest slot in `refs` to a screen point, within `radius` css px. */
  private nearest(refs: SlotRef[], x: number, y: number, radius: number): SlotRef | null {
    const game = this.host.game;
    const view = this.renderer.view;
    let best: SlotRef | null = null;
    let bestD = radius * radius;
    for (const ref of refs) {
      const p = game.slotPos(ref.ring, ref.index);
      const dx = view.sx(p.x) - x;
      const dy = view.sy(p.y) - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = ref; }
    }
    return best;
  }

  private snapRadius(): number {
    return Math.max(56, this.renderer.towerRadius() * 4);
  }

  private down(e: PointerEvent): void {
    if (this.pending) return;
    const [x, y] = this.local(e);
    this.lastX = x;
    this.lastY = y;
    const game = this.host.game;
    const selected = this.host.ui.selected;

    // With a tower selected, a tap near any of its matches merges into that match.
    let tapMergeInto: SlotRef | null = null;
    if (selected && game.tower(selected)) {
      tapMergeInto = this.nearest(game.mergeTargets(selected), x, y, this.snapRadius() * 0.75);
    }

    const slot = tapMergeInto ?? this.towerAt(x, y, Math.max(26, this.renderer.towerRadius() * 1.6));
    if (slot) {
      this.pending = { from: slot, x, y, id: e.pointerId, tapMergeInto };
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
      this.pending.tapMergeInto = null;
      this.host.select(null);
    }
    if (ui.drag) {
      ui.drag.x = x;
      ui.drag.y = y;
      this.refreshHover();
    }
  }

  /**
   * Recomputes the drop target; called on move and every frame, since slots keep orbiting.
   * A matching tower anywhere near the finger wins, so near-misses still merge.
   */
  refreshHover(): void {
    const ui = this.host.ui;
    if (!ui.drag) { ui.hover = null; return; }
    const game = this.host.game;
    const from = ui.drag.from;
    const match = this.nearest(game.mergeTargets(from), this.lastX, this.lastY, this.snapRadius());
    if (match) { ui.hover = match; return; }
    const slot = this.renderer.slotAt(game, this.lastX, this.lastY, Math.max(30, this.renderer.towerRadius() * 2));
    ui.hover = slot && !same(slot, from) && !game.tower(slot) ? slot : null;
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
    } else if (this.pending.tapMergeInto && ui.selected) {
      const into = this.pending.tapMergeInto;
      if (game.merge(ui.selected, into)) {
        this.host.haptic(18);
        // Keep the merged tower selected so chains of merges are quick.
        this.host.select(game.mergeTargets(into).length > 0 ? into : null);
      }
    } else if (same(ui.selected, this.pending.from)) {
      this.host.select(null);
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
