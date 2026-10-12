import { ARENA, RINGS, type EnemyKind, type TowerType } from './defs';
import type { Notation } from './format';

export interface Tower {
  id: number;
  type: TowerType;
  tier: number;
  invested: number; // Scrap spent on this tower and everything merged into it
  cooldown: number;
  shots: number;
  kills: number;
}

export interface SlotRef {
  ring: number;
  index: number;
}

export interface RunState {
  wave: number;
  maxWave: number;
  waveTime: number;
  toSpawn: EnemyKind[];
  spawnTimer: number;
  spawnInterval: number;
  scrap: number;
  spin: number;
  scrapEarned: number;
  spinEarned: number;
  builds: number;
  integrity: number;
  upgrades: Record<string, number>;
  slots: (Tower | null)[][];
  ringAngle: number[];
  ringRev: number[];
  overdriveTime: number;
  overdriveCooldown: number;
  waveRevs: number;
  holdWave: boolean;
  lastBossCleared: number;
  time: number;
  kills: number;
  autoTimers: { build: number; merge: number; upgrade: number };
  incomeSamples: { t: number; scrap: number; spin: number }[];
  sampleTimer: number;
}

export interface Settings {
  notation: Notation;
  autoBuild: boolean;
  autoMerge: boolean;
  autoUpgrade: boolean;
  bulk: 1 | 5 | 0; // 0 = max
  reduceMotion: boolean;
  haptics: boolean;
  debug: boolean;
}

export interface MetaState {
  cores: number;
  coresTotal: number;
  collapses: number;
  tree: Record<string, number>;
  achievements: string[];
  bestWave: number;
  totalKills: number;
  totalMerges: number;
  highestTier: number;
  totalTime: number;
  overdrives: number;
  tutorial: number; // index of the next tutorial hint to show
  settings: Settings;
}

export interface SaveData {
  version: number;
  run: RunState;
  meta: MetaState;
  rng: number;
  nextId: number;
  lastSave: number; // wall-clock ms
}

export const SAVE_VERSION = 1;

export function emptySlots(): (Tower | null)[][] {
  return RINGS.map((r) => new Array<Tower | null>(r.slots).fill(null));
}

export function newRun(): RunState {
  return {
    wave: 1,
    maxWave: 1,
    waveTime: 0,
    toSpawn: [],
    spawnTimer: 0,
    spawnInterval: 1,
    scrap: 30,
    spin: 0,
    scrapEarned: 0,
    spinEarned: 0,
    builds: 0,
    integrity: ARENA.baseIntegrity,
    upgrades: {},
    slots: emptySlots(),
    ringAngle: RINGS.map(() => 0),
    ringRev: RINGS.map(() => 0),
    overdriveTime: 0,
    overdriveCooldown: 0,
    waveRevs: 0,
    holdWave: false,
    lastBossCleared: 0,
    time: 0,
    kills: 0,
    autoTimers: { build: 0, merge: 0, upgrade: 0 },
    incomeSamples: [],
    sampleTimer: 0,
  };
}

export function newMeta(): MetaState {
  return {
    cores: 0,
    coresTotal: 0,
    collapses: 0,
    tree: {},
    achievements: [],
    bestWave: 1,
    totalKills: 0,
    totalMerges: 0,
    highestTier: 1,
    totalTime: 0,
    overdrives: 0,
    tutorial: 0,
    settings: {
      notation: 'letters',
      autoBuild: true,
      autoMerge: true,
      autoUpgrade: true,
      bulk: 1,
      reduceMotion: false,
      haptics: true,
      debug: false,
    },
  };
}
