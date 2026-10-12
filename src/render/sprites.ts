import { TOWERS, type EnemyKind, type TowerType } from '../core/defs';

// Sprites are drawn once into offscreen canvases (glow included) and reused every frame,
// because shadowBlur on every draw call is too slow on phones.

const cache = new Map<string, HTMLCanvasElement>();

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(size);
  return [c, c.getContext('2d')!];
}

function polygon(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sides: number, rot = -Math.PI / 2): void {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** A tower: a polygon with tier + 2 sides, glowing in its type colour, with a type glyph inside. */
export function towerSprite(type: TowerType, tier: number, radius: number): HTMLCanvasElement {
  const key = `t:${type}:${tier}:${Math.round(radius)}`;
  let c = cache.get(key);
  if (c) return c;
  const pad = radius * 0.9;
  const size = (radius + pad) * 2;
  let ctx: CanvasRenderingContext2D;
  [c, ctx] = canvas(size);
  const m = size / 2;
  const color = TOWERS[type].color;
  const sides = tier + 2;

  ctx.shadowColor = color;
  ctx.shadowBlur = radius * 0.8;
  polygon(ctx, m, m, radius, sides);
  ctx.fillStyle = 'rgba(8, 14, 34, 0.92)';
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, radius * 0.14);
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.globalAlpha = 0.18 + tier * 0.025;
  polygon(ctx, m, m, radius * 0.72, sides);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(1.2, radius * 0.1);
  ctx.lineCap = 'round';
  const g = radius * 0.38;
  ctx.beginPath();
  switch (type) {
    case 'pulse':
      ctx.arc(m, m, g * 0.55, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'arc':
      ctx.moveTo(m - g * 0.4, m - g);
      ctx.lineTo(m + g * 0.3, m - g * 0.1);
      ctx.lineTo(m - g * 0.3, m + g * 0.1);
      ctx.lineTo(m + g * 0.4, m + g);
      ctx.stroke();
      break;
    case 'frost':
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        ctx.moveTo(m - Math.cos(a) * g, m - Math.sin(a) * g);
        ctx.lineTo(m + Math.cos(a) * g, m + Math.sin(a) * g);
      }
      ctx.stroke();
      break;
    case 'mortar':
      ctx.arc(m, m, g * 0.85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(m, m, g * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
  }
  cache.set(key, c);
  return c;
}

const ENEMY_COLOR: Record<EnemyKind, string> = {
  drone: '#ff3b6b', swarmer: '#ff6a5c', brute: '#ff2d55', shielded: '#ff4fa3', warden: '#ff5cf0', hive: '#ff5cf0',
};

/** Enemies are jagged red and magenta shapes so they never read as towers. */
export function enemySprite(kind: EnemyKind, radius: number, flash: boolean): HTMLCanvasElement {
  const key = `e:${kind}:${Math.round(radius)}:${flash ? 1 : 0}`;
  let c = cache.get(key);
  if (c) return c;
  const size = radius * 3.2;
  let ctx: CanvasRenderingContext2D;
  [c, ctx] = canvas(size);
  const m = size / 2;
  const color = flash ? '#ffffff' : ENEMY_COLOR[kind];
  ctx.shadowColor = ENEMY_COLOR[kind];
  ctx.shadowBlur = radius * 0.7;
  ctx.strokeStyle = color;
  ctx.fillStyle = flash ? 'rgba(255,255,255,0.6)' : 'rgba(40, 6, 20, 0.85)';
  ctx.lineWidth = Math.max(1.3, radius * 0.16);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const spikes = { drone: 4, swarmer: 3, brute: 8, shielded: 5, warden: 10, hive: 7 }[kind];
  const inner = { drone: 0.55, swarmer: 0.5, brute: 0.72, shielded: 0.6, warden: 0.62, hive: 0.5 }[kind];
  for (let i = 0; i < spikes * 2; i++) {
    const a = -Math.PI / 2 + (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? radius : radius * inner;
    const x = m + Math.cos(a) * r;
    const y = m + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  if (kind === 'hive' || kind === 'warden') {
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(m, m, radius * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  cache.set(key, c);
  return c;
}

export function clearSpriteCache(): void {
  cache.clear();
}
