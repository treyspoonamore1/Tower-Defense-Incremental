import type { MetaState, RunState } from './state';

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  check: (run: RunState, meta: MetaState) => boolean;
}

const towers = (run: RunState) => run.slots.flat().filter((t) => t !== null);

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'build1', name: 'Foundations', desc: 'Build a tower', check: (r) => r.builds >= 1 },
  { id: 'merge1', name: 'Fusion', desc: 'Merge two towers', check: (_, m) => m.totalMerges >= 1 },
  { id: 'merge100', name: 'Compression', desc: 'Merge 100 times', check: (_, m) => m.totalMerges >= 100 },
  { id: 'tier5', name: 'Heptagon', desc: 'Reach tier V', check: (_, m) => m.highestTier >= 5 },
  { id: 'tier8', name: 'Decagon', desc: 'Reach tier VIII', check: (_, m) => m.highestTier >= 8 },
  { id: 'tier10', name: 'Twelve Sides', desc: 'Reach tier X', check: (_, m) => m.highestTier >= 10 },
  { id: 'boss1', name: 'Warden Down', desc: 'Clear the wave 10 boss', check: (r, m) => r.lastBossCleared >= 10 || m.bestWave > 11 },
  { id: 'wave25', name: 'Holding the Line', desc: 'Reach wave 25', check: (_, m) => m.bestWave >= 25 },
  { id: 'wave50', name: 'Critical Mass', desc: 'Reach wave 50', check: (_, m) => m.bestWave >= 50 },
  { id: 'wave75', name: 'Deep Orbit', desc: 'Reach wave 75', check: (_, m) => m.bestWave >= 75 },
  { id: 'wave100', name: 'The Wall', desc: 'Reach wave 100', check: (_, m) => m.bestWave >= 100 },
  { id: 'wave150', name: 'Past the Wall', desc: 'Reach wave 150', check: (_, m) => m.bestWave >= 150 },
  { id: 'collapse1', name: 'Implosion', desc: 'Collapse once', check: (_, m) => m.collapses >= 1 },
  { id: 'collapse10', name: 'Serial Collapser', desc: 'Collapse 10 times', check: (_, m) => m.collapses >= 10 },
  { id: 'kills1000', name: 'Thousand Sparks', desc: 'Destroy 1,000 enemies', check: (_, m) => m.totalKills >= 1000 },
  { id: 'kills25000', name: 'Scrap Baron', desc: 'Destroy 25,000 enemies', check: (_, m) => m.totalKills >= 25000 },
  { id: 'full', name: 'Crowded Orbit', desc: 'Fill every open slot', check: (r, m) => {
    const open = r.slots.filter((_, i) => i < 2 || (m.tree['ring3'] ?? 0) > 0);
    return open.every((ring) => ring.every((t) => t !== null));
  } },
  { id: 'frost4', name: 'Cold Front', desc: 'Have 4 Frost towers at once', check: (r) => towers(r).filter((t) => t!.type === 'frost').length >= 4 },
  { id: 'overdrive10', name: 'Redline', desc: 'Use Overdrive 10 times', check: (_, m) => m.overdrives >= 10 },
  { id: 'cores100', name: 'Core Collector', desc: 'Earn 100 Cores in total', check: (_, m) => m.coresTotal >= 100 },
];

export const ACHIEVEMENT_DAMAGE = 1.02;
