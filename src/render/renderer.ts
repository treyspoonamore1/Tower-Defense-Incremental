import { ARENA, RINGS, TOWERS } from '../core/defs';
import type { Game } from '../core/game';
import type { SlotRef } from '../core/state';
import { enemySprite, towerSprite } from './sprites';

export interface DragState {
  from: SlotRef;
  x: number; // css px
  y: number;
}

export interface UiState {
  drag: DragState | null;
  selected: SlotRef | null;
  hover: SlotRef | null; // slot under the dragged tower
}

const TAU = Math.PI * 2;
const VIEW_RADIUS = 560; // arena units that fit across the short side (the spawn edge sits just off-screen)

/** World-to-screen mapping for the arena canvas, in CSS pixels. */
export class View {
  scale = 1;
  cx = 0;
  cy = 0;
  width = 0;
  height = 0;

  fit(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.scale = Math.min(width, height) / (2 * VIEW_RADIUS);
    this.cx = width / 2;
    this.cy = height / 2;
  }

  sx(x: number): number { return this.cx + x * this.scale; }
  sy(y: number): number { return this.cy + y * this.scale; }
  wx(px: number): number { return (px - this.cx) / this.scale; }
  wy(py: number): number { return (py - this.cy) / this.scale; }
}

interface Star { x: number; y: number; r: number; a: number }

export class Renderer {
  ctx: CanvasRenderingContext2D;
  view = new View();
  dpr = 1;
  private stars: Star[] = [];
  private time = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    for (let i = 0; i < 90; i++) {
      this.stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.2 + 0.3, a: Math.random() * 0.5 + 0.15 });
    }
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.max(1, Math.round(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * this.dpr));
    this.view.fit(rect.width, rect.height);
  }

  /** Tower radius on screen, in CSS px. */
  towerRadius(): number {
    return Math.max(11, Math.min(20, 46 * this.view.scale));
  }

  draw(game: Game, ui: UiState, dt: number, reduceMotion: boolean): void {
    this.time += dt;
    const { ctx, view } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(game);

    const s = view.scale;
    const cx = view.cx;
    const cy = view.cy;

    // Spawn edge
    ctx.save();
    ctx.setLineDash([2, 7]);
    ctx.strokeStyle = 'rgba(255, 80, 120, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, ARENA.spawnRadius * s, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // Rings and slots
    const dragTower = ui.drag ? game.tower(ui.drag.from) : null;
    for (let ring = 0; ring < RINGS.length; ring++) {
      const def = RINGS[ring];
      const open = game.ringOpen(ring);
      ctx.save();
      if (!open) ctx.setLineDash([6, 6]);
      ctx.strokeStyle = open ? 'rgba(120, 200, 255, 0.28)' : 'rgba(120, 140, 190, 0.14)';
      ctx.lineWidth = open ? 1.5 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, def.radius * s, 0, TAU);
      ctx.stroke();
      ctx.restore();
      if (!open) continue;
      for (let i = 0; i < def.slots; i++) {
        const p = game.slotPos(ring, i);
        const t = game.run.slots[ring][i];
        if (t) continue;
        const hover = ui.hover && ui.hover.ring === ring && ui.hover.index === i;
        ctx.beginPath();
        ctx.arc(view.sx(p.x), view.sy(p.y), this.towerRadius() * 0.45, 0, TAU);
        ctx.strokeStyle = hover ? 'rgba(160, 255, 200, 0.9)' : dragTower ? 'rgba(160, 255, 200, 0.45)' : 'rgba(120, 200, 255, 0.3)';
        ctx.lineWidth = hover ? 2 : 1;
        ctx.stroke();
      }
    }

    // Burning ground
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of game.burns) {
      const x = view.sx(b.x);
      const y = view.sy(b.y);
      const r = b.radius * s;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(255, 120, 40, 0.35)');
      g.addColorStop(1, 'rgba(255, 80, 20, 0)');
      ctx.globalAlpha = Math.min(1, b.t);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // Selected tower range
    if (ui.selected) {
      const t = game.tower(ui.selected);
      if (t) {
        const p = game.slotPos(ui.selected.ring, ui.selected.index);
        ctx.beginPath();
        ctx.arc(view.sx(p.x), view.sy(p.y), game.towerRange(t) * s, 0, TAU);
        ctx.fillStyle = 'rgba(120, 220, 255, 0.07)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 220, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    this.drawCore(game);
    this.drawEnemies(game);
    this.drawTowers(game, ui);
    this.drawProjectiles(game);
    this.drawEffects(game, reduceMotion);

    // Dragged tower follows the finger; a line shows which match it will snap into.
    if (ui.drag && dragTower) {
      if (ui.hover && game.tower(ui.hover)) {
        const p = game.slotPos(ui.hover.ring, ui.hover.index);
        ctx.beginPath();
        ctx.moveTo(ui.drag.x, ui.drag.y);
        ctx.lineTo(view.sx(p.x), view.sy(p.y));
        ctx.strokeStyle = 'rgba(160, 255, 200, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      const r = this.towerRadius() * 1.15;
      const spr = towerSprite(dragTower.type, dragTower.tier, r * this.dpr);
      const size = spr.width / this.dpr;
      ctx.globalAlpha = 0.9;
      ctx.drawImage(spr, ui.drag.x - size / 2, ui.drag.y - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
  }

  private drawBackground(game: Game): void {
    const { ctx, view } = this;
    const w = view.width;
    const h = view.height;
    const grad = ctx.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, Math.max(w, h) * 0.75);
    const breach = game.run.integrity <= game.maxIntegrity() * 0.25;
    grad.addColorStop(0, breach ? '#2a0b22' : '#0f1d40');
    grad.addColorStop(1, '#050816');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#cfe6ff';
    for (const st of this.stars) {
      ctx.globalAlpha = st.a;
      ctx.fillRect(st.x * w, st.y * h, st.r, st.r);
    }
    ctx.globalAlpha = 1;
  }

  private drawCore(game: Game): void {
    const { ctx, view } = this;
    const r = ARENA.coreRadius * view.scale;
    const x = view.cx;
    const y = view.cy;
    const od = game.run.overdriveTime > 0;
    const pulse = 1 + Math.sin(this.time * (od ? 12 : 3)) * 0.06;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
    glow.addColorStop(0, od ? 'rgba(255, 255, 255, 0.9)' : 'rgba(124, 246, 255, 0.85)');
    glow.addColorStop(0.35, od ? 'rgba(124, 246, 255, 0.5)' : 'rgba(60, 160, 255, 0.35)');
    glow.addColorStop(1, 'rgba(20, 60, 140, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 2.2 * pulse, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55 * pulse, 0, TAU);
    ctx.fillStyle = '#e9fdff';
    ctx.fill();

    // Overdrive cooldown ring
    const cd = game.run.overdriveCooldown;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (cd > 0) {
      ctx.strokeStyle = 'rgba(124, 246, 255, 0.35)';
      ctx.arc(x, y, r * 1.05, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - cd / 60));
    } else {
      ctx.strokeStyle = `rgba(124, 246, 255, ${0.6 + Math.sin(this.time * 4) * 0.3})`;
      ctx.arc(x, y, r * 1.05, 0, TAU);
    }
    ctx.stroke();
  }

  private drawEnemies(game: Game): void {
    const { ctx, view } = this;
    const s = view.scale;
    for (const e of game.enemies) {
      if (e.hp <= 0) continue;
      const x = view.sx(e.x);
      const y = view.sy(e.y);
      const r = Math.max(6, e.size * s * 1.05);
      const spr = enemySprite(e.kind, r * this.dpr, e.hitFlash > 0);
      const size = spr.width / this.dpr;
      const frozen = game.run.time < e.frozenUntil;
      const slowed = game.run.time < e.slowUntil;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.time * (e.boss ? 0.6 : 1.5) + e.id);
      ctx.drawImage(spr, -size / 2, -size / 2, size, size);
      ctx.restore();
      if (slowed || frozen) {
        ctx.beginPath();
        ctx.arc(x, y, r * 1.15, 0, TAU);
        ctx.strokeStyle = frozen ? 'rgba(220, 245, 255, 0.95)' : 'rgba(159, 212, 255, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      if (e.kind === 'warden') {
        ctx.beginPath();
        ctx.arc(x, y, r * 1.5, e.shieldAngle - Math.PI / 3, e.shieldAngle + Math.PI / 3);
        ctx.strokeStyle = 'rgba(255, 180, 250, 0.95)';
        ctx.lineWidth = 3.5;
        ctx.stroke();
      }
      if (e.kind === 'shielded' && e.hp > e.maxHp * 0.5) {
        ctx.beginPath();
        ctx.arc(x, y, r * 1.35, 0, TAU);
        ctx.strokeStyle = 'rgba(255, 140, 220, 0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const showBar = e.boss || ((e.kind === 'brute' || e.kind === 'shielded') && e.hp < e.maxHp);
      if (showBar) {
        const w = Math.max(18, r * 2.4);
        const f = Math.max(0, e.hp / e.maxHp);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x - w / 2, y - r * 1.6 - 5, w, 3.5);
        ctx.fillStyle = e.boss ? '#ff5cf0' : '#ff4f7b';
        ctx.fillRect(x - w / 2, y - r * 1.6 - 5, w * f, 3.5);
      }
    }
  }

  private drawTowers(game: Game, ui: UiState): void {
    const { ctx, view } = this;
    const r = this.towerRadius();
    // Matches glow for the tower being dragged, or for the selected tower (tap a glowing one to merge).
    const source = ui.drag?.from ?? ui.selected;
    const sourceTower = source ? game.tower(source) : null;
    for (let ring = 0; ring < RINGS.length; ring++) {
      const slots = game.run.slots[ring];
      for (let i = 0; i < slots.length; i++) {
        const t = slots[i];
        if (!t) continue;
        const p = game.slotPos(ring, i);
        const x = view.sx(p.x);
        const y = view.sy(p.y);
        const dragging = ui.drag && ui.drag.from.ring === ring && ui.drag.from.index === i;
        const isSource = source && source.ring === ring && source.index === i;
        const match = sourceTower && !isSource && sourceTower.type === t.type && sourceTower.tier === t.tier && t.tier < ARENA.maxTier;
        if (isSource && !ui.drag) {
          ctx.beginPath();
          ctx.arc(x, y, r * 1.5, 0, TAU);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (match) {
          const hover = ui.hover && ui.hover.ring === ring && ui.hover.index === i;
          ctx.beginPath();
          ctx.arc(x, y, r * (1.45 + Math.sin(this.time * 8) * 0.08), 0, TAU);
          ctx.fillStyle = hover ? 'rgba(160, 255, 200, 0.35)' : 'rgba(160, 255, 200, 0.16)';
          ctx.fill();
        }
        const spr = towerSprite(t.type, t.tier, r * this.dpr);
        const size = spr.width / this.dpr;
        ctx.save();
        ctx.globalAlpha = dragging ? 0.25 : 1;
        ctx.translate(x, y);
        ctx.rotate(game.run.ringAngle[ring] * 0.5);
        ctx.drawImage(spr, -size / 2, -size / 2, size, size);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawProjectiles(game: Game): void {
    const { ctx, view } = this;
    for (const p of game.projectiles) {
      const x = view.sx(p.x);
      const y = view.sy(p.y);
      if (p.kind === 'bolt') {
        ctx.fillStyle = TOWERS.pulse.color;
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, TAU);
        ctx.fill();
      } else {
        const f = Math.min(1, p.t / p.flight);
        const lift = Math.sin(f * Math.PI) * 18;
        ctx.fillStyle = TOWERS.mortar.color;
        ctx.beginPath();
        ctx.arc(x, y - lift, 3.5, 0, TAU);
        ctx.fill();
      }
    }
  }

  private drawEffects(game: Game, reduceMotion: boolean): void {
    const { ctx, view } = this;
    const s = view.scale;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const fx of game.effects) {
      const f = fx.t / fx.life;
      const a = 1 - f;
      switch (fx.kind) {
        case 'lightning': {
          ctx.strokeStyle = `rgba(255, 236, 120, ${a})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          const pts = fx.points;
          ctx.moveTo(view.sx(pts[0]), view.sy(pts[1]));
          for (let i = 2; i < pts.length; i += 2) {
            const px = view.sx(pts[i - 2]);
            const py = view.sy(pts[i - 1]);
            const nx = view.sx(pts[i]);
            const ny = view.sy(pts[i + 1]);
            const mx = (px + nx) / 2 + (Math.random() - 0.5) * 10;
            const my = (py + ny) / 2 + (Math.random() - 0.5) * 10;
            ctx.lineTo(mx, my);
            ctx.lineTo(nx, ny);
          }
          ctx.stroke();
          break;
        }
        case 'boom':
          ctx.globalAlpha = a * 0.7;
          ctx.strokeStyle = fx.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(view.sx(fx.x), view.sy(fx.y), fx.radius * s * (0.4 + f * 0.6), 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'ring':
          ctx.globalAlpha = a * 0.5;
          ctx.strokeStyle = fx.color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(view.sx(fx.x), view.sy(fx.y), fx.radius * s * (0.6 + f * 0.4), 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        case 'pop': {
          if (reduceMotion) break;
          const r = this.towerRadius() * (1 + f * 1.2);
          ctx.globalAlpha = a;
          ctx.strokeStyle = fx.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(view.sx(fx.x), view.sy(fx.y), r, 0, TAU);
          ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'spark':
          if (reduceMotion) break;
          ctx.globalAlpha = a;
          ctx.fillStyle = fx.color;
          ctx.fillRect(view.sx(fx.x) - 1.5, view.sy(fx.y) - 1.5, 3, 3);
          ctx.globalAlpha = 1;
          break;
        case 'block':
          ctx.globalAlpha = a;
          ctx.fillStyle = '#ffd0fa';
          ctx.beginPath();
          ctx.arc(view.sx(fx.x), view.sy(fx.y), 4, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
          break;
      }
    }
    ctx.restore();
  }

  /** Finds the open slot nearest to a screen point, within the touch radius. */
  slotAt(game: Game, px: number, py: number, radiusPx = 34): SlotRef | null {
    let best: SlotRef | null = null;
    let bestD = radiusPx * radiusPx;
    for (let ring = 0; ring < RINGS.length; ring++) {
      if (!game.ringOpen(ring)) continue;
      for (let i = 0; i < RINGS[ring].slots; i++) {
        const p = game.slotPos(ring, i);
        const dx = this.view.sx(p.x) - px;
        const dy = this.view.sy(p.y) - py;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { ring, index: i }; }
      }
    }
    return best;
  }

  isCore(px: number, py: number): boolean {
    const dx = px - this.view.cx;
    const dy = py - this.view.cy;
    return Math.hypot(dx, dy) <= Math.max(28, ARENA.coreRadius * this.view.scale * 1.3);
  }
}

