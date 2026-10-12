// Headless balance simulator. Plays the game with a simple "reasonable player" strategy
// and reports how long it takes to hit the pacing milestones from the design doc.
//
//   npm run sim                 # default: 4 Collapses
//   npm run sim -- --collapses 8 --seed 7

import { CORE_NODES } from '../src/core/defs';
import { fmtTime } from '../src/core/format';
import { Game } from '../src/core/game';

const args = process.argv.slice(2);
const opt = (name: string, def: number) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : def;
};

const collapses = opt('collapses', 4);
const seed = opt('seed', 1);
const stallLimit = opt('stall', 600); // seconds without a new best wave before collapsing
const maxHours = opt('hours', 24);

const game = new Game(undefined, seed);
const s = game.meta.settings;
s.autoBuild = s.autoMerge = s.autoUpgrade = true;

const marks = new Map<string, number>();
const mark = (key: string) => { if (!marks.has(key)) marks.set(key, game.meta.totalTime); };

/** What an engaged player does each second: build, merge, upgrade, Overdrive. */
function playerTick(): void {
  game.buildMany(0);
  let pair = game.findMergePair();
  while (pair) {
    game.merge(pair[0], pair[1]);
    pair = game.findMergePair();
  }
  if (game.meta.totalMerges > 0) mark('first merge');
  while (game.autoUpgrade(0.5));
  game.buildMany(0);
  if (game.overdriveReady() && game.enemies.length > 0) game.overdrive();
}

function buyNodes(): void {
  let bought = true;
  while (bought) {
    bought = false;
    const affordable = CORE_NODES.filter((n) => game.canBuyNode(n)).sort((a, b) => game.nodeCost(a) - game.nodeCost(b));
    if (affordable.length) bought = game.buyNode(affordable[0].id);
  }
}

console.log(`seed ${seed}, target ${collapses} Collapses`);
console.log('collapse | run time | best wave | cores gained | total time');
let best = 0;
let lastProgress = 0;
let runStart = 0;
let done = 0;
while (done < collapses && game.meta.totalTime < maxHours * 3600) {
  for (let i = 0; i < 30; i++) game.step(1 / 30);
  game.events.length = 0;
  playerTick();
  const w = game.run.maxWave;
  if (w >= 10 && game.run.lastBossCleared >= 10) mark('first boss (wave 10)');
  if (w >= 50) mark('wave 50');
  if (w >= 100) mark('wave 100');
  if (w > best) { best = w; lastProgress = game.meta.totalTime; }
  const stalled = game.meta.totalTime - lastProgress > stallLimit;
  if (stalled && game.canCollapse()) {
    const runTime = game.meta.totalTime - runStart;
    const gain = game.collapse();
    done++;
    if (done === 1) mark('first Collapse');
    console.log(`${String(done).padStart(8)} | ${fmtTime(runTime).padStart(8)} | ${String(best).padStart(9)} | ${String(gain).padStart(12)} | ${fmtTime(game.meta.totalTime)}`);
    buyNodes();
    best = 0;
    lastProgress = game.meta.totalTime;
    runStart = game.meta.totalTime;
  } else if (stalled && game.meta.totalTime - lastProgress > stallLimit * 4) {
    console.log(`stuck at wave ${best} without reaching a Collapse`);
    break;
  }
}

console.log('\nmilestone | time');
for (const [k, v] of marks) console.log(`${k} | ${fmtTime(v)}`);
console.log(`\nCore tree: ${JSON.stringify(game.meta.tree)}`);
console.log(`achievements: ${game.meta.achievements.length}, highest tier: ${game.meta.highestTier}`);
