import { describe, expect, it } from 'vitest';
import { fmt, roman } from '../src/core/format';
import { Game } from '../src/core/game';
import type { Tower } from '../src/core/state';

const tower = (g: Game, type: Tower['type'], tier: number): Tower => ({ id: g.nextId++, type, tier, invested: 10, cooldown: 0, shots: 0, kills: 0 });

describe('format', () => {
  it('formats small, grouped, suffixed and scientific numbers', () => {
    expect(fmt(5)).toBe('5');
    expect(fmt(2.5)).toBe('2.5');
    expect(fmt(12345)).toBe('12,345');
    expect(fmt(1.5e6)).toBe('1.50M');
    expect(fmt(2.34e12)).toBe('2.34T');
    expect(fmt(1e40)).toBe('1.00e40');
    expect(fmt(1.5e6, 'scientific')).toBe('1.50e6');
    expect(roman(10)).toBe('X');
  });
});

describe('formulas', () => {
  const g = new Game(undefined, 1);
  it('matches the design doc', () => {
    expect(g.buildCost(0)).toBe(10);
    expect(g.buildCost(1)).toBeCloseTo(11.5);
    expect(g.waveHp(1)).toBe(12);
    expect(g.waveHp(100) / g.waveHp(99)).toBeCloseTo(1.115 * 2);
    expect(g.collapseGain(49)).toBe(0);
    expect(g.collapseGain(50)).toBe(10);
    expect(g.collapseGain(75)).toBe(33);
    expect(g.collapseGain(100)).toBe(80);
  });
});

describe('towers', () => {
  it('builds into the inner ring first and charges Scrap', () => {
    const g = new Game(undefined, 1);
    g.run.scrap = 100;
    expect(g.build()).toBe(true);
    expect(g.run.slots[0][0]).not.toBeNull();
    expect(g.run.scrap).toBeCloseTo(90);
    expect(g.buildCost()).toBeCloseTo(11.5);
  });

  it('merges only matching type and tier', () => {
    const g = new Game(undefined, 1);
    g.run.slots[0][0] = tower(g, 'pulse', 2);
    g.run.slots[0][1] = tower(g, 'pulse', 2);
    g.run.slots[0][2] = tower(g, 'arc', 2);
    expect(g.canMerge({ ring: 0, index: 0 }, { ring: 0, index: 2 })).toBe(false);
    expect(g.merge({ ring: 0, index: 0 }, { ring: 0, index: 1 })).toBe(true);
    expect(g.run.slots[0][0]).toBeNull();
    expect(g.run.slots[0][1]!.tier).toBe(3);
    expect(g.run.slots[0][1]!.invested).toBe(20);
  });

  it('does not merge past the tier cap', () => {
    const g = new Game(undefined, 1);
    g.run.slots[0][0] = tower(g, 'frost', 10);
    g.run.slots[0][1] = tower(g, 'frost', 10);
    expect(g.canMerge({ ring: 0, index: 0 }, { ring: 0, index: 1 })).toBe(false);
  });

  it('moves only into open, empty slots', () => {
    const g = new Game(undefined, 1);
    g.run.slots[0][0] = tower(g, 'pulse', 1);
    expect(g.move({ ring: 0, index: 0 }, { ring: 2, index: 0 })).toBe(false); // ring 3 locked
    expect(g.move({ ring: 0, index: 0 }, { ring: 1, index: 3 })).toBe(true);
    expect(g.run.slots[1][3]).not.toBeNull();
  });

  it('sells for half the invested Scrap', () => {
    const g = new Game(undefined, 1);
    g.run.scrap = 0;
    g.run.slots[0][0] = tower(g, 'pulse', 1);
    g.sell({ ring: 0, index: 0 });
    expect(g.run.scrap).toBe(5);
  });
});

describe('combat', () => {
  it('kills enemies and earns Scrap and Spin', () => {
    const g = new Game(undefined, 3);
    g.run.slots[0][0] = tower(g, 'pulse', 3);
    g.run.slots[1][0] = tower(g, 'arc', 3);
    g.update(60);
    expect(g.run.kills).toBeGreaterThan(5);
    expect(g.run.scrapEarned).toBeGreaterThan(0);
    expect(g.run.spinEarned).toBeGreaterThan(0);
    expect(g.run.wave).toBeGreaterThan(1);
  });

  it('breaches back to the wave after the last boss cleared', () => {
    const g = new Game(undefined, 3);
    g.run.lastBossCleared = 10;
    g.skipWaves(5);
    g.run.integrity = 1;
    g.update(60);
    expect(g.events.some((e) => e.type === 'breach' && e.toWave === 11)).toBe(true);
  });
});

describe('prestige', () => {
  it('collapses for Cores and resets the run', () => {
    const g = new Game(undefined, 1);
    g.run.maxWave = 75;
    g.run.scrap = 1e9;
    expect(g.collapse()).toBe(33);
    expect(g.meta.cores).toBe(33);
    expect(g.run.wave).toBe(1);
    expect(g.run.scrap).toBe(100); // 1-Collapse milestone
    expect(g.buyNode('ignition')).toBe(true);
    expect(g.buyNode('mortar')).toBe(false); // requires Calibrated Barrels 2
    expect(g.damageMult()).toBeGreaterThanOrEqual(2);
  });
});

describe('save', () => {
  it('round-trips and grants offline earnings', () => {
    const g = new Game(undefined, 5);
    g.run.slots[0][0] = tower(g, 'pulse', 4);
    g.update(120);
    const data = JSON.parse(JSON.stringify(g.toSave()));
    const h = Game.fromSave(data);
    expect(h.run.slots[0][0]!.tier).toBe(4);
    const before = h.run.scrap;
    const report = h.applyOffline(3600);
    expect(report).not.toBeNull();
    expect(h.run.scrap).toBeGreaterThan(before);
    expect(h.applyOffline(30)).toBeNull();
  });
});
