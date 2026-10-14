// Static game data. Every balance number lives here so tuning never touches logic.

export type TowerType = 'pulse' | 'arc' | 'frost' | 'mortar';
export type EnemyKind = 'drone' | 'swarmer' | 'brute' | 'shielded' | 'warden' | 'hive';

export const ARENA = {
  coreRadius: 60,
  spawnRadius: 600,
  baseIntegrity: 20,
  maxTier: 10,
};

export interface RingDef {
  radius: number;
  slots: number;
  period: number; // seconds per revolution at 1x speed
  dir: 1 | -1;
}

export const RINGS: RingDef[] = [
  { radius: 140, slots: 4, period: 4, dir: 1 },
  { radius: 230, slots: 6, period: 6, dir: -1 },
  { radius: 320, slots: 8, period: 9, dir: 1 },
];

export interface TowerDef {
  type: TowerType;
  name: string;
  role: string;
  color: string;
  baseDamage: number;
  rate: number; // shots (or ticks) per second
  range: number;
  perk5: string;
  perk10: string;
}

export const TOWERS: Record<TowerType, TowerDef> = {
  pulse: {
    type: 'pulse', name: 'Pulse', role: 'Single target', color: '#3ee8ff',
    baseDamage: 10, rate: 2, range: 150,
    perk5: 'Shots pierce 1 enemy', perk10: 'Every 5th shot fires 3 bolts',
  },
  arc: {
    type: 'arc', name: 'Arc', role: 'Chain lightning', color: '#ffe14a',
    baseDamage: 6, rate: 1, range: 130,
    perk5: '+2 chain jumps', perk10: 'Chains no longer lose damage',
  },
  frost: {
    type: 'frost', name: 'Frost', role: 'Slowing aura', color: '#9fd4ff',
    baseDamage: 2, rate: 1, range: 110,
    perk5: 'Freezes each new enemy for 0.5 s', perk10: 'Slowed enemies take +50% damage',
  },
  mortar: {
    type: 'mortar', name: 'Mortar', role: 'Splash', color: '#ff9a3c',
    baseDamage: 25, rate: 0.4, range: 220,
    perk5: 'Leaves burning ground for 3 s', perk10: 'Shells split into 3',
  },
};

export const TOWER_TIER_DAMAGE = 2.5;
export const TOWER_TIER_RANGE = 0.04;

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number; // multiplier on wave HP
  speed: number; // au/s
  scrap: number; // multiplier on wave Scrap
  damage: number; // integrity removed on reaching the core
  firstWave: number;
  size: number; // au, for drawing and hit tests
  boss?: boolean;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  drone: { kind: 'drone', name: 'Drone', hp: 1, speed: 52, scrap: 1, damage: 1, firstWave: 1, size: 14 },
  swarmer: { kind: 'swarmer', name: 'Swarmer', hp: 0.3, speed: 90, scrap: 0.3, damage: 1, firstWave: 5, size: 9 },
  brute: { kind: 'brute', name: 'Brute', hp: 6, speed: 29, scrap: 5, damage: 3, firstWave: 12, size: 22 },
  shielded: { kind: 'shielded', name: 'Shielded', hp: 2, speed: 46, scrap: 3, damage: 1, firstWave: 20, size: 16 },
  warden: { kind: 'warden', name: 'Warden', hp: 20, speed: 24, scrap: 20, damage: 10, firstWave: 10, size: 34, boss: true },
  hive: { kind: 'hive', name: 'Hive', hp: 20, speed: 24, scrap: 20, damage: 10, firstWave: 20, size: 34, boss: true },
};

export const NORMAL_ENEMIES: EnemyKind[] = ['drone', 'swarmer', 'brute', 'shielded'];

export const WAVE = {
  baseHp: 12,
  hpGrowth: 1.115,
  wallEvery: 100,
  scrapGrowth: 1.09,
  spawnDuration: 8,
  maxDuration: 22,
  bossEvery: 10,
  speedPerWave: 0.01, // +1% enemy speed per wave...
  maxSpeedMult: 2.5, // ...up to 2.5x
  rushEvery: 5, // every 5th wave that is not a boss wave is a Rush wave
  rushSpeed: 1.4,
  rushSpawnDuration: 4,
};

/** Flow tuning: how the early game speeds up so resets feel fast. */
export const FLOW = {
  catchUpBelow: 0.5, // waves below this fraction of your best wave run faster...
  catchUpBase: 3, // ...at 3x game speed after the first Collapse,
  catchUpPerCollapse: 0.1, // +0.1x per further Collapse,
  catchUpMax: 6, // up to 6x.
  sprintMult: 3, // enemies move 3x faster until they near the outermost tower ring
  sprintMargin: 180, // au beyond the outermost open ring where sprinting stops
  overlapShare: 0.15, // next wave starts when <=15% of the wave is left alive (no boss)
  overlapDelay: 0.5,
  clearDelay: 0.8,
  chainWindow: 1.2, // seconds between kills to keep a chain going
  chainBonusPer: 0.005, // +0.5% Scrap per chained kill...
  chainBonusMax: 0.5, // ...up to +50%
};

/** Ring speed while the player is aiming a merge (holding or has selected a tower). */
export const AIM_ORBIT_MULT = 0.15;

export interface UpgradeDef {
  id: string;
  name: string;
  currency: 'scrap' | 'spin';
  base: number;
  growth: number;
  max: number; // Infinity for uncapped
  desc: string;
}

export const RUN_UPGRADES: UpgradeDef[] = [
  { id: 'firepower', name: 'Firepower', currency: 'scrap', base: 25, growth: 1.45, max: Infinity, desc: '×1.15 damage' },
  { id: 'rapid', name: 'Rapid Fire', currency: 'scrap', base: 40, growth: 1.6, max: 40, desc: '+5% shots per second' },
  { id: 'salvage', name: 'Salvage', currency: 'scrap', base: 60, growth: 1.55, max: Infinity, desc: '×1.10 Scrap' },
  { id: 'reinforce', name: 'Reinforce', currency: 'scrap', base: 100, growth: 2, max: 10, desc: '+2 core integrity' },
  { id: 'orbit', name: 'Orbit Speed', currency: 'spin', base: 20, growth: 1.5, max: 50, desc: '+8% orbit speed' },
  { id: 'pulse', name: 'Revolution Pulse', currency: 'spin', base: 50, growth: 1.7, max: Infinity, desc: 'Each revolution deals 50% damage to enemies in range' },
  { id: 'momentum', name: 'Momentum', currency: 'spin', base: 100, growth: 1.8, max: 25, desc: '+1% damage per revolution this wave, up to +10% per level' },
  { id: 'spinyield', name: 'Spin Yield', currency: 'spin', base: 30, growth: 1.5, max: Infinity, desc: '×1.2 Spin' },
];

export interface NodeDef {
  id: string;
  name: string;
  branch: 'Root' | 'Arsenal' | 'Engine' | 'Industry' | 'Automation';
  base: number;
  growth: number; // cost = base * growth^level
  max: number;
  requires: { id: string; level: number }[];
  desc: string;
}

export const CORE_NODES: NodeDef[] = [
  { id: 'ignition', name: 'Ignition', branch: 'Root', base: 1, growth: 1, max: 1, requires: [], desc: '×2 damage and ×2 Scrap' },
  { id: 'barrels', name: 'Calibrated Barrels', branch: 'Arsenal', base: 2, growth: 2, max: 10, requires: [{ id: 'ignition', level: 1 }], desc: '×1.5 damage per level' },
  { id: 'mortar', name: 'Mortar Schematic', branch: 'Arsenal', base: 12, growth: 1, max: 1, requires: [{ id: 'barrels', level: 2 }], desc: 'Unlocks the Mortar tower' },
  { id: 'overcharge', name: 'Overcharge', branch: 'Arsenal', base: 15, growth: 1, max: 1, requires: [{ id: 'barrels', level: 3 }], desc: 'Overdrive lasts 15 s and doubles damage' },
  { id: 'bearings', name: 'Bearings', branch: 'Engine', base: 2, growth: 2, max: 10, requires: [{ id: 'ignition', level: 1 }], desc: '+10% orbit speed per level' },
  { id: 'ring3', name: 'Third Ring', branch: 'Engine', base: 10, growth: 1, max: 1, requires: [{ id: 'bearings', level: 2 }], desc: 'Unlocks Ring 3 (8 slots)' },
  { id: 'salvagerights', name: 'Salvage Rights', branch: 'Industry', base: 2, growth: 2, max: 10, requires: [{ id: 'ignition', level: 1 }], desc: '×1.5 Scrap per level' },
  { id: 'headstart', name: 'Head Start', branch: 'Industry', base: 20, growth: 3, max: 5, requires: [{ id: 'salvagerights', level: 2 }], desc: 'Runs start 10 waves later per level (up to half your best wave), with the Scrap those waves would pay' },
  { id: 'blueprints', name: 'Blueprints', branch: 'Industry', base: 25, growth: 5, max: 4, requires: [{ id: 'salvagerights', level: 3 }], desc: 'Built towers start 1 tier higher per level' },
  { id: 'autobuild', name: 'Auto-Build', branch: 'Automation', base: 5, growth: 1, max: 1, requires: [{ id: 'ignition', level: 1 }], desc: 'Builds a tower every 2 s when affordable' },
  { id: 'automerge', name: 'Auto-Merge', branch: 'Automation', base: 20, growth: 1, max: 1, requires: [{ id: 'autobuild', level: 1 }], desc: 'Merges the lowest matching pair every second' },
  { id: 'autoupgrade', name: 'Auto-Upgrade', branch: 'Automation', base: 50, growth: 1, max: 1, requires: [{ id: 'automerge', level: 1 }], desc: 'Buys the cheapest run upgrade every second' },
];

export interface MilestoneDef {
  collapses: number;
  desc: string;
}

export const MILESTONES: MilestoneDef[] = [
  { collapses: 1, desc: 'Start each run with 100 Scrap, and replay early waves at 3× speed (Catch-up)' },
  { collapses: 3, desc: 'Bulk build: ×5 and Max' },
  { collapses: 5, desc: 'Start each run with a starter kit of towers, growing with Collapses and your best tier' },
  { collapses: 10, desc: 'Keep 10% of Spin upgrade levels on Collapse' },
];

export const COLLAPSE_WAVE = 50;

export const OVERDRIVE = { duration: 10, overchargedDuration: 15, cooldown: 60, speed: 3 };

export const OFFLINE = { efficiency: 0.5, capSeconds: 8 * 3600, windowSeconds: 300, sampleSeconds: 10 };
