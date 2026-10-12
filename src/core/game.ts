import {
  ARENA, COLLAPSE_WAVE, CORE_NODES, ENEMIES, MILESTONES, NORMAL_ENEMIES, OFFLINE, OVERDRIVE, RINGS,
  RUN_UPGRADES, TOWERS, TOWER_TIER_DAMAGE, TOWER_TIER_RANGE, WAVE, AIM_ORBIT_MULT,
  type EnemyKind, type NodeDef, type TowerType, type UpgradeDef,
} from './defs';
import { ACHIEVEMENTS, ACHIEVEMENT_DAMAGE } from './achievements';
import { Rng } from './rng';
import {
  SAVE_VERSION, newMeta, newRun, type MetaState, type RunState, type SaveData, type SlotRef, type Tower,
} from './state';

export const STEP = 1 / 30;
const TAU = Math.PI * 2;

export interface Enemy {
  id: number;
  kind: EnemyKind;
  boss: boolean;
  wave: number;
  r: number;
  theta: number;
  spiral: number; // radians of drift per au travelled (signed)
  hp: number;
  maxHp: number;
  speed: number;
  scrap: number;
  damage: number;
  size: number;
  slowUntil: number;
  slowFactor: number;
  frozenUntil: number;
  frozenOnce: boolean;
  vulnUntil: number;
  shieldAngle: number;
  spawnTimer: number;
  hitFlash: number;
  x: number;
  y: number;
}

export interface Projectile {
  kind: 'bolt' | 'shell';
  x: number;
  y: number;
  sx: number; // shell start
  sy: number;
  tx: number;
  ty: number;
  targetId: number;
  speed: number;
  damage: number;
  tier: number;
  pierce: number;
  t: number;
  flight: number;
  hit: number[]; // enemies already hit by this bolt
}

export interface Burn {
  x: number;
  y: number;
  radius: number;
  dps: number;
  t: number;
}

export type Effect =
  | { kind: 'lightning'; points: number[]; t: number; life: number }
  | { kind: 'boom'; x: number; y: number; radius: number; color: string; t: number; life: number }
  | { kind: 'ring'; x: number; y: number; radius: number; color: string; t: number; life: number }
  | { kind: 'pop'; x: number; y: number; color: string; t: number; life: number }
  | { kind: 'spark'; x: number; y: number; vx: number; vy: number; color: string; t: number; life: number }
  | { kind: 'block'; x: number; y: number; t: number; life: number };

export type GameEvent =
  | { type: 'merge'; tier: number }
  | { type: 'build' }
  | { type: 'bossKill'; wave: number }
  | { type: 'breach'; toWave: number }
  | { type: 'achievement'; name: string }
  | { type: 'wave'; wave: number; rush: boolean }
  | { type: 'collapse'; cores: number };

export interface OfflineReport {
  seconds: number;
  scrap: number;
  spin: number;
}

export class Game {
  run: RunState;
  meta: MetaState;
  rng: Rng;
  nextId = 1;
  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  burns: Burn[] = [];
  effects: Effect[] = [];
  events: GameEvent[] = [];
  private breather = 0;
  /** True while the player is aiming a merge; rings slow down so targets are easy to hit. */
  aiming = false;
  private anyDead = false;
  private achievementTimer = 0;

  constructor(save?: SaveData, seed = Date.now() & 0xffffffff) {
    if (save) {
      this.run = save.run;
      this.meta = { ...newMeta(), ...save.meta, settings: { ...newMeta().settings, ...save.meta.settings } };
      this.rng = new Rng(save.rng);
      this.nextId = save.nextId;
      this.run.toSpawn = [];
      this.startWave(this.run.wave);
    } else {
      this.meta = newMeta();
      this.run = newRun();
      this.rng = new Rng(seed);
      this.startRun();
    }
  }

  // ---------- Save / load ----------

  toSave(now = Date.now()): SaveData {
    return { version: SAVE_VERSION, run: this.run, meta: this.meta, rng: this.rng.state, nextId: this.nextId, lastSave: now };
  }

  static fromSave(data: SaveData): Game {
    if (!data || data.version !== SAVE_VERSION) throw new Error('Unsupported save version');
    return new Game(structuredClone(data));
  }

  /** Grants offline earnings from the run's recent income rate. */
  applyOffline(seconds: number): OfflineReport | null {
    const s = Math.min(Math.max(0, seconds), OFFLINE.capSeconds);
    if (s < 60) return null;
    const rate = this.incomeRate();
    const scrap = rate.scrap * s * OFFLINE.efficiency;
    const spin = rate.spin * s * OFFLINE.efficiency;
    this.run.scrap += scrap;
    this.run.spin += spin;
    this.run.scrapEarned += scrap;
    this.run.spinEarned += spin;
    return { seconds: s, scrap, spin };
  }

  incomeRate(): { scrap: number; spin: number } {
    const samples = this.run.incomeSamples;
    if (samples.length < 2) return { scrap: 0, spin: 0 };
    const a = samples[0];
    const b = samples[samples.length - 1];
    const dt = b.t - a.t;
    if (dt <= 0) return { scrap: 0, spin: 0 };
    return { scrap: (b.scrap - a.scrap) / dt, spin: (b.spin - a.spin) / dt };
  }

  // ---------- Derived stats ----------

  up(id: string): number {
    return this.run.upgrades[id] ?? 0;
  }

  node(id: string): number {
    return this.meta.tree[id] ?? 0;
  }

  ringOpen(ring: number): boolean {
    return ring < 2 || (ring === 2 && this.node('ring3') > 0);
  }

  unlockedTypes(): TowerType[] {
    const types: TowerType[] = ['pulse', 'arc', 'frost'];
    if (this.node('mortar') > 0) types.push('mortar');
    return types;
  }

  damageMult(): number {
    let m = Math.pow(1.15, this.up('firepower'));
    m *= this.node('ignition') > 0 ? 2 : 1;
    m *= Math.pow(1.5, this.node('barrels'));
    m *= Math.pow(ACHIEVEMENT_DAMAGE, this.meta.achievements.length);
    const momentumCap = 0.1 * this.up('momentum');
    m *= 1 + Math.min(0.01 * this.run.waveRevs, momentumCap);
    if (this.run.overdriveTime > 0 && this.node('overcharge') > 0) m *= 2;
    return m;
  }

  rateMult(): number {
    return 1 + 0.05 * this.up('rapid');
  }

  scrapMult(): number {
    let m = Math.pow(1.1, this.up('salvage'));
    m *= this.node('ignition') > 0 ? 2 : 1;
    m *= Math.pow(1.5, this.node('salvagerights'));
    return m;
  }

  spinMult(): number {
    return Math.pow(1.2, this.up('spinyield'));
  }

  orbitMult(): number {
    let m = (1 + 0.08 * this.up('orbit')) * (1 + 0.1 * this.node('bearings'));
    if (this.run.overdriveTime > 0) m *= OVERDRIVE.speed;
    if (this.aiming) m *= AIM_ORBIT_MULT;
    return m;
  }

  maxIntegrity(): number {
    return ARENA.baseIntegrity + 2 * this.up('reinforce');
  }

  towerDamage(t: Tower, mult = this.damageMult()): number {
    return TOWERS[t.type].baseDamage * Math.pow(TOWER_TIER_DAMAGE, t.tier - 1) * mult;
  }

  towerRange(t: Tower): number {
    return TOWERS[t.type].range * (1 + TOWER_TIER_RANGE * (t.tier - 1));
  }

  /** Approximate damage per second, for the info card. */
  towerDps(t: Tower): number {
    const d = this.towerDamage(t);
    const rate = TOWERS[t.type].rate * this.rateMult();
    if (t.type === 'arc') {
      const jumps = 2 + (t.tier >= 5 ? 2 : 0);
      const fall = t.tier >= 10 ? 1 : 0.75;
      let total = 0;
      for (let i = 0, f = 1; i <= jumps; i++, f *= fall) total += f;
      return d * rate * total;
    }
    return d * rate;
  }

  waveHp(w: number): number {
    return WAVE.baseHp * Math.pow(WAVE.hpGrowth, w - 1) * Math.pow(2, Math.floor(w / WAVE.wallEvery));
  }

  waveScrap(w: number): number {
    return Math.pow(WAVE.scrapGrowth, w - 1);
  }

  isRushWave(w: number): boolean {
    return w % WAVE.rushEvery === 0 && w % WAVE.bossEvery !== 0;
  }

  waveSpeedMult(w: number): number {
    const base = Math.min(1 + WAVE.speedPerWave * (w - 1), WAVE.maxSpeedMult);
    return this.isRushWave(w) ? base * WAVE.rushSpeed : base;
  }

  buildCost(builds = this.run.builds): number {
    return 10 * Math.pow(1.15, builds);
  }

  upgradeCost(u: UpgradeDef, level = this.up(u.id)): number {
    return u.base * Math.pow(u.growth, level);
  }

  nodeCost(n: NodeDef, level = this.node(n.id)): number {
    return Math.ceil(n.base * Math.pow(n.growth, level));
  }

  collapseGain(wave = this.run.maxWave): number {
    if (wave < COLLAPSE_WAVE) return 0;
    return Math.floor(10 * Math.pow(wave / COLLAPSE_WAVE, 3));
  }

  milestone(collapses: number): boolean {
    return this.meta.collapses >= collapses;
  }

  slotPos(ring: number, index: number): { x: number; y: number } {
    const def = RINGS[ring];
    const a = this.run.ringAngle[ring] + (index * TAU) / def.slots;
    return { x: Math.cos(a) * def.radius, y: Math.sin(a) * def.radius };
  }

  tower(ref: SlotRef): Tower | null {
    return this.run.slots[ref.ring]?.[ref.index] ?? null;
  }

  // ---------- Player actions ----------

  emptySlot(): SlotRef | null {
    for (let ring = 0; ring < RINGS.length; ring++) {
      if (!this.ringOpen(ring)) continue;
      const slots = this.run.slots[ring];
      for (let index = 0; index < slots.length; index++) if (!slots[index]) return { ring, index };
    }
    return null;
  }

  canBuild(): boolean {
    return this.run.scrap >= this.buildCost() && this.emptySlot() !== null;
  }

  build(): boolean {
    const slot = this.emptySlot();
    const cost = this.buildCost();
    if (!slot || this.run.scrap < cost) return false;
    this.run.scrap -= cost;
    this.run.builds++;
    const tier = Math.min(ARENA.maxTier, 1 + this.node('blueprints'));
    const tower: Tower = { id: this.nextId++, type: this.rng.pick(this.unlockedTypes()), tier, invested: cost, cooldown: 0, shots: 0, kills: 0 };
    this.run.slots[slot.ring][slot.index] = tower;
    this.meta.highestTier = Math.max(this.meta.highestTier, tier);
    const p = this.slotPos(slot.ring, slot.index);
    this.effects.push({ kind: 'pop', x: p.x, y: p.y, color: TOWERS[tower.type].color, t: 0, life: 0.35 });
    this.events.push({ type: 'build' });
    return true;
  }

  /** Builds up to `count` towers (0 = as many as possible). Returns how many were built. */
  buildMany(count: number): number {
    let built = 0;
    while ((count === 0 || built < count) && this.build()) built++;
    return built;
  }

  /** Every tower that the tower at `from` can merge into. */
  mergeTargets(from: SlotRef): SlotRef[] {
    const out: SlotRef[] = [];
    this.run.slots.forEach((ring, r) => ring.forEach((_, i) => {
      if (this.canMerge(from, { ring: r, index: i })) out.push({ ring: r, index: i });
    }));
    return out;
  }

  canMerge(a: SlotRef, b: SlotRef): boolean {
    if (a.ring === b.ring && a.index === b.index) return false;
    const ta = this.tower(a);
    const tb = this.tower(b);
    return !!ta && !!tb && ta.type === tb.type && ta.tier === tb.tier && ta.tier < ARENA.maxTier;
  }

  merge(from: SlotRef, to: SlotRef): boolean {
    if (!this.canMerge(from, to)) return false;
    const a = this.tower(from)!;
    const b = this.tower(to)!;
    b.tier++;
    b.invested += a.invested;
    b.kills += a.kills;
    b.cooldown = 0;
    this.run.slots[from.ring][from.index] = null;
    this.meta.totalMerges++;
    this.meta.highestTier = Math.max(this.meta.highestTier, b.tier);
    const p = this.slotPos(to.ring, to.index);
    const color = TOWERS[b.type].color;
    this.effects.push({ kind: 'pop', x: p.x, y: p.y, color, t: 0, life: 0.45 });
    for (let i = 0; i < 10; i++) {
      const a2 = (i / 10) * TAU;
      this.effects.push({ kind: 'spark', x: p.x, y: p.y, vx: Math.cos(a2) * 160, vy: Math.sin(a2) * 160, color, t: 0, life: 0.4 });
    }
    this.events.push({ type: 'merge', tier: b.tier });
    return true;
  }

  move(from: SlotRef, to: SlotRef): boolean {
    if (!this.ringOpen(to.ring) || this.tower(to) || !this.tower(from)) return false;
    this.run.slots[to.ring][to.index] = this.tower(from);
    this.run.slots[from.ring][from.index] = null;
    return true;
  }

  sellValue(ref: SlotRef): number {
    return (this.tower(ref)?.invested ?? 0) * 0.5;
  }

  sell(ref: SlotRef): boolean {
    const t = this.tower(ref);
    if (!t) return false;
    this.run.scrap += t.invested * 0.5;
    this.run.slots[ref.ring][ref.index] = null;
    return true;
  }

  /** Finds the lowest-tier matching pair, preferring to keep the tower on the inner ring. */
  findMergePair(): [SlotRef, SlotRef] | null {
    const refs: SlotRef[] = [];
    this.run.slots.forEach((ring, r) => ring.forEach((t, i) => { if (t && t.tier < ARENA.maxTier) refs.push({ ring: r, index: i }); }));
    refs.sort((p, q) => this.tower(p)!.tier - this.tower(q)!.tier || p.ring - q.ring || p.index - q.index);
    for (let i = 0; i < refs.length; i++) {
      for (let j = i + 1; j < refs.length; j++) {
        if (this.canMerge(refs[j], refs[i])) return [refs[j], refs[i]];
      }
    }
    return null;
  }

  canBuyUpgrade(u: UpgradeDef): boolean {
    const level = this.up(u.id);
    if (level >= u.max) return false;
    return this.run[u.currency] >= this.upgradeCost(u);
  }

  buyUpgrade(id: string): boolean {
    const u = RUN_UPGRADES.find((x) => x.id === id);
    if (!u || !this.canBuyUpgrade(u)) return false;
    this.run[u.currency] -= this.upgradeCost(u);
    this.run.upgrades[id] = this.up(id) + 1;
    if (id === 'reinforce') this.run.integrity += 2;
    return true;
  }

  nodeAvailable(n: NodeDef): boolean {
    return n.requires.every((r) => this.node(r.id) >= r.level);
  }

  canBuyNode(n: NodeDef): boolean {
    return this.nodeAvailable(n) && this.node(n.id) < n.max && this.meta.cores >= this.nodeCost(n);
  }

  buyNode(id: string): boolean {
    const n = CORE_NODES.find((x) => x.id === id);
    if (!n || !this.canBuyNode(n)) return false;
    this.meta.cores -= this.nodeCost(n);
    this.meta.tree[id] = this.node(id) + 1;
    return true;
  }

  overdriveReady(): boolean {
    return this.run.overdriveCooldown <= 0;
  }

  overdrive(): boolean {
    if (!this.overdriveReady()) return false;
    this.run.overdriveTime = this.node('overcharge') > 0 ? OVERDRIVE.overchargedDuration : OVERDRIVE.duration;
    this.run.overdriveCooldown = OVERDRIVE.cooldown;
    this.meta.overdrives++;
    this.effects.push({ kind: 'ring', x: 0, y: 0, radius: 400, color: '#7cf6ff', t: 0, life: 0.6 });
    return true;
  }

  canCollapse(): boolean {
    return this.run.maxWave >= COLLAPSE_WAVE;
  }

  collapse(): number {
    if (!this.canCollapse()) return 0;
    const gain = this.collapseGain();
    this.meta.cores += gain;
    this.meta.coresTotal += gain;
    this.meta.collapses++;
    const keptSpin: Record<string, number> = {};
    if (this.milestone(10)) {
      for (const u of RUN_UPGRADES) if (u.currency === 'spin') keptSpin[u.id] = Math.floor(this.up(u.id) * 0.1);
    }
    this.run = newRun();
    this.run.upgrades = keptSpin;
    this.enemies = [];
    this.projectiles = [];
    this.burns = [];
    this.startRun();
    this.events.push({ type: 'collapse', cores: gain });
    this.checkAchievements();
    return gain;
  }

  hardReset(): void {
    this.meta = newMeta();
    this.run = newRun();
    this.enemies = [];
    this.projectiles = [];
    this.burns = [];
    this.effects = [];
    this.startRun();
  }

  private startRun(): void {
    if (this.milestone(1)) this.run.scrap = 100;
    if (this.milestone(5)) {
      const tower: Tower = { id: this.nextId++, type: this.rng.pick(this.unlockedTypes()), tier: 3, invested: 0, cooldown: 0, shots: 0, kills: 0 };
      this.run.slots[0][0] = tower;
    }
    this.startWave(1);
  }

  // ---------- Waves ----------

  private startWave(w: number): void {
    const run = this.run;
    run.wave = w;
    run.maxWave = Math.max(run.maxWave, w);
    this.meta.bestWave = Math.max(this.meta.bestWave, w);
    run.waveTime = 0;
    run.waveRevs = 0;
    const queue: EnemyKind[] = [];
    const n = Math.min(10 + Math.floor(w / 3), 40);
    const weights: [EnemyKind, number][] = NORMAL_ENEMIES.map((k) => {
      const def = ENEMIES[k];
      if (w < def.firstWave) return [k, 0];
      const ramp = k === 'drone' ? 1 : Math.min(1, (w - def.firstWave + 1) / 20);
      const base = { drone: 1, swarmer: 0.5, brute: 0.3, shielded: 0.4 }[k as 'drone'];
      return [k, base * ramp];
    });
    const total = weights.reduce((s, [, x]) => s + x, 0);
    let count = 0;
    while (count < n) {
      let roll = this.rng.next() * total;
      let kind: EnemyKind = 'drone';
      for (const [k, x] of weights) {
        if (roll < x) { kind = k; break; }
        roll -= x;
      }
      if (kind === 'swarmer') {
        for (let i = 0; i < 5; i++) queue.push('swarmer');
        count += 3;
      } else {
        queue.push(kind);
        count++;
      }
    }
    if (w % WAVE.bossEvery === 0) queue.push((w / WAVE.bossEvery) % 2 === 1 ? 'warden' : 'hive');
    run.toSpawn = queue;
    const rush = this.isRushWave(w);
    run.spawnInterval = (rush ? WAVE.rushSpawnDuration : WAVE.spawnDuration) / queue.length;
    run.spawnTimer = 0;
    this.events.push({ type: 'wave', wave: w, rush });
  }

  private spawn(kind: EnemyKind, r = ARENA.spawnRadius, theta = this.rng.next() * TAU): Enemy {
    const def = ENEMIES[kind];
    const w = this.run.wave;
    const hp = this.waveHp(w) * def.hp;
    const drift = (this.rng.range(15, 30) * Math.PI) / 180 / 100;
    const e: Enemy = {
      id: this.nextId++, kind, boss: !!def.boss, wave: w, r, theta,
      spiral: drift * (this.rng.next() < 0.5 ? -1 : 1),
      hp, maxHp: hp, speed: def.speed * this.waveSpeedMult(w), scrap: this.waveScrap(w) * def.scrap,
      damage: def.damage, size: def.size, slowUntil: 0, slowFactor: 1, frozenUntil: 0, frozenOnce: false,
      vulnUntil: 0, shieldAngle: this.rng.next() * TAU, spawnTimer: 3, hitFlash: 0,
      x: Math.cos(theta) * r, y: Math.sin(theta) * r,
    };
    this.enemies.push(e);
    return e;
  }

  private nextWave(): void {
    this.startWave(this.run.holdWave ? this.run.wave : this.run.wave + 1);
  }

  private breach(): void {
    const run = this.run;
    const to = run.lastBossCleared + 1;
    for (const e of this.enemies) this.effects.push({ kind: 'boom', x: e.x, y: e.y, radius: 40, color: '#ff3b6b', t: 0, life: 0.5 });
    this.enemies = [];
    this.projectiles = [];
    this.burns = [];
    run.integrity = this.maxIntegrity();
    this.events.push({ type: 'breach', toWave: to });
    this.startWave(to);
  }

  // ---------- Simulation ----------

  /** Advances the game by `dt` seconds in fixed steps. */
  update(dt: number): void {
    let left = dt;
    while (left > 1e-9) {
      const step = Math.min(STEP, left);
      this.step(step);
      left -= step;
    }
  }

  step(dt: number): void {
    const run = this.run;
    run.time += dt;
    this.meta.totalTime += dt;

    if (run.overdriveTime > 0) run.overdriveTime = Math.max(0, run.overdriveTime - dt);
    if (run.overdriveCooldown > 0) run.overdriveCooldown = Math.max(0, run.overdriveCooldown - dt);

    this.updateRings(dt);
    this.updateSpawning(dt);
    this.updateEnemies(dt);
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateBurns(dt);
    if (this.anyDead) {
      this.anyDead = false;
      this.enemies = this.enemies.filter((e) => e.hp > 0);
    }
    this.updateEffects(dt);
    this.updateAutomation(dt);

    run.sampleTimer += dt;
    if (run.sampleTimer >= OFFLINE.sampleSeconds) {
      run.sampleTimer = 0;
      run.incomeSamples.push({ t: run.time, scrap: run.scrapEarned, spin: run.spinEarned });
      const keep = OFFLINE.windowSeconds / OFFLINE.sampleSeconds + 1;
      if (run.incomeSamples.length > keep) run.incomeSamples.splice(0, run.incomeSamples.length - keep);
    }

    this.achievementTimer += dt;
    if (this.achievementTimer >= 1) {
      this.achievementTimer = 0;
      this.checkAchievements();
    }
  }

  checkAchievements(): void {
    for (const a of ACHIEVEMENTS) {
      if (this.meta.achievements.includes(a.id)) continue;
      if (a.check(this.run, this.meta)) {
        this.meta.achievements.push(a.id);
        this.events.push({ type: 'achievement', name: a.name });
      }
    }
  }

  private updateRings(dt: number): void {
    const run = this.run;
    const mult = this.orbitMult();
    for (let ring = 0; ring < RINGS.length; ring++) {
      const def = RINGS[ring];
      const delta = (TAU / def.period) * mult * dt;
      run.ringAngle[ring] = (run.ringAngle[ring] + def.dir * delta) % TAU;
      if (!this.ringOpen(ring)) continue;
      run.ringRev[ring] += delta;
      while (run.ringRev[ring] >= TAU) {
        run.ringRev[ring] -= TAU;
        this.onRevolution(ring);
      }
    }
  }

  private onRevolution(ring: number): void {
    const run = this.run;
    const pulseLevel = this.up('pulse');
    const dmgMult = this.damageMult();
    run.slots[ring].forEach((t, index) => {
      if (!t) return;
      const spin = t.tier * this.spinMult();
      run.spin += spin;
      run.spinEarned += spin;
      run.waveRevs++;
      if (pulseLevel > 0) {
        const p = this.slotPos(ring, index);
        const range = this.towerRange(t);
        const dmg = this.towerDamage(t, dmgMult) * 0.5 * pulseLevel;
        for (const e of this.enemies) {
          if (dist2(p.x, p.y, e.x, e.y) <= range * range) this.damage(e, dmg, p.x, p.y, false, t);
        }
        this.effects.push({ kind: 'ring', x: p.x, y: p.y, radius: range, color: TOWERS[t.type].color, t: 0, life: 0.35 });
      }
    });
  }

  private updateSpawning(dt: number): void {
    const run = this.run;
    run.waveTime += dt;
    if (run.toSpawn.length > 0) {
      run.spawnTimer -= dt;
      while (run.spawnTimer <= 0 && run.toSpawn.length > 0) {
        this.spawn(run.toSpawn.shift()!);
        run.spawnTimer += run.spawnInterval;
      }
    }
    const cleared = run.toSpawn.length === 0 && this.enemies.length === 0;
    if (cleared) this.breather += dt;
    else this.breather = 0;
    if ((cleared && this.breather >= 1.2) || run.waveTime >= WAVE.maxDuration) {
      this.breather = 0;
      this.nextWave();
    }
  }

  private updateEnemies(dt: number): void {
    const run = this.run;
    const t = run.time;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hp <= 0) continue;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      let mult = 1;
      if (t < e.frozenUntil) mult = 0;
      else if (t < e.slowUntil) mult = e.slowFactor;
      const k = e.spiral;
      const vr = (e.speed * mult) / Math.sqrt(1 + (e.r * k) * (e.r * k));
      e.r -= vr * dt;
      e.theta += k * vr * dt;
      e.x = Math.cos(e.theta) * e.r;
      e.y = Math.sin(e.theta) * e.r;
      if (e.kind === 'warden') e.shieldAngle += 0.6 * dt;
      if (e.kind === 'hive') {
        e.spawnTimer -= dt;
        if (e.spawnTimer <= 0 && this.enemies.length < 120) {
          e.spawnTimer = 3;
          for (let j = 0; j < 5; j++) this.spawn('swarmer', e.r + 10, e.theta + (j - 2) * 0.03);
        }
      }
      if (e.r <= ARENA.coreRadius) {
        this.enemies.splice(i, 1);
        run.integrity -= e.damage;
        this.effects.push({ kind: 'boom', x: e.x, y: e.y, radius: 50, color: '#ff3b6b', t: 0, life: 0.4 });
        if (run.integrity <= 0) {
          this.breach();
          return;
        }
      }
    }
  }

  private target(x: number, y: number, range: number, exclude?: number[]): Enemy | null {
    let best: Enemy | null = null;
    const r2 = range * range;
    for (const e of this.enemies) {
      if (e.hp <= 0) continue;
      if (exclude && exclude.includes(e.id)) continue;
      if (dist2(x, y, e.x, e.y) > r2) continue;
      if (!best || e.r < best.r) best = e;
    }
    return best;
  }

  private nearest(x: number, y: number, range: number, exclude: number[]): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range * range;
    for (const e of this.enemies) {
      if (e.hp <= 0 || exclude.includes(e.id)) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d <= bestD) { best = e; bestD = d; }
    }
    return best;
  }

  private updateTowers(dt: number): void {
    const run = this.run;
    const rate = this.rateMult();
    const dmgMult = this.damageMult();
    for (let ring = 0; ring < RINGS.length; ring++) {
      const slots = run.slots[ring];
      for (let index = 0; index < slots.length; index++) {
        const t = slots[index];
        if (!t) continue;
        t.cooldown -= dt * rate;
        if (t.cooldown > 0) continue;
        const p = this.slotPos(ring, index);
        const range = this.towerRange(t);
        const target = this.target(p.x, p.y, range);
        if (!target) { t.cooldown = 0; continue; }
        t.cooldown += 1 / TOWERS[t.type].rate;
        t.shots++;
        this.fire(t, p.x, p.y, range, target, this.towerDamage(t, dmgMult));
      }
    }
  }

  private fire(t: Tower, x: number, y: number, range: number, target: Enemy, dmg: number): void {
    switch (t.type) {
      case 'pulse': {
        const targets = [target];
        if (t.tier >= 10 && t.shots % 5 === 0) {
          for (let i = 0; i < 2; i++) {
            const extra = this.target(x, y, range, targets.map((e) => e.id));
            if (extra) targets.push(extra);
          }
        }
        for (const e of targets) {
          this.projectiles.push({ kind: 'bolt', x, y, sx: x, sy: y, tx: e.x, ty: e.y, targetId: e.id, speed: 700, damage: dmg, tier: t.tier, pierce: t.tier >= 5 ? 1 : 0, t: 0, flight: 0, hit: [] });
        }
        break;
      }
      case 'arc': {
        const jumps = 2 + (t.tier >= 5 ? 2 : 0);
        const falloff = t.tier >= 10 ? 1 : 0.75;
        const hit: number[] = [];
        const points = [x, y];
        let cur: Enemy | null = target;
        let d = dmg;
        for (let i = 0; i <= jumps && cur; i++) {
          hit.push(cur.id);
          points.push(cur.x, cur.y);
          this.damage(cur, d, points[points.length - 4], points[points.length - 3], true, t);
          d *= falloff;
          cur = this.nearest(cur.x, cur.y, 110, hit);
        }
        this.effects.push({ kind: 'lightning', points, t: 0, life: 0.18 });
        break;
      }
      case 'frost': {
        const now = this.run.time;
        for (const e of this.enemies) {
          if (dist2(x, y, e.x, e.y) > range * range) continue;
          if (!e.boss || now >= e.slowUntil) {
            e.slowUntil = now + 1.2;
            e.slowFactor = e.boss ? 0.8 : 0.6;
          }
          if (t.tier >= 5 && !e.frozenOnce && !e.boss) {
            e.frozenOnce = true;
            e.frozenUntil = now + 0.5;
          }
          if (t.tier >= 10) e.vulnUntil = now + 1.2;
          this.damage(e, dmg, x, y, false, t);
        }
        this.effects.push({ kind: 'ring', x, y, radius: range, color: TOWERS.frost.color, t: 0, life: 0.5 });
        break;
      }
      case 'mortar': {
        const shells = t.tier >= 10 ? 3 : 1;
        for (let i = 0; i < shells; i++) {
          const ox = i === 0 ? 0 : (i === 1 ? 1 : -1) * 45;
          const oy = i === 0 ? 0 : (i === 1 ? -1 : 1) * 25;
          this.projectiles.push({ kind: 'shell', x, y, sx: x, sy: y, tx: target.x + ox, ty: target.y + oy, targetId: target.id, speed: 0, damage: dmg, tier: t.tier, pierce: 0, t: 0, flight: 0.6, hit: [] });
        }
        break;
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.t += dt;
      if (p.kind === 'shell') {
        const f = Math.min(1, p.t / p.flight);
        p.x = p.sx + (p.tx - p.sx) * f;
        p.y = p.sy + (p.ty - p.sy) * f;
        if (f >= 1) {
          this.projectiles.splice(i, 1);
          this.explode(p);
        }
        continue;
      }
      let target = this.enemies.find((e) => e.id === p.targetId && e.hp > 0) ?? null;
      if (!target) {
        target = this.nearest(p.x, p.y, 120, p.hit);
        if (!target) { this.projectiles.splice(i, 1); continue; }
        p.targetId = target.id;
      }
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const d = Math.hypot(dx, dy);
      const stepLen = p.speed * dt;
      if (d <= stepLen + target.size * 0.5 || p.t > 2) {
        p.x = target.x;
        p.y = target.y;
        p.hit.push(target.id);
        this.damage(target, p.damage, p.sx, p.sy, false, null);
        if (p.pierce > 0) {
          p.pierce--;
          const next = this.nearest(p.x, p.y, 120, p.hit);
          if (next) { p.targetId = next.id; p.sx = p.x; p.sy = p.y; continue; }
        }
        this.projectiles.splice(i, 1);
      } else {
        p.x += (dx / d) * stepLen;
        p.y += (dy / d) * stepLen;
      }
    }
  }

  private explode(p: Projectile): void {
    const radius = 70;
    for (const e of this.enemies) {
      if (dist2(p.tx, p.ty, e.x, e.y) <= (radius + e.size * 0.5) ** 2) this.damage(e, p.damage, p.sx, p.sy, false, null);
    }
    this.effects.push({ kind: 'boom', x: p.tx, y: p.ty, radius, color: TOWERS.mortar.color, t: 0, life: 0.4 });
    if (p.tier >= 5) this.burns.push({ x: p.tx, y: p.ty, radius: 60, dps: p.damage * 0.2, t: 3 });
  }

  private updateBurns(dt: number): void {
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      b.t -= dt;
      if (b.t <= 0) { this.burns.splice(i, 1); continue; }
      for (const e of this.enemies) {
        if (dist2(b.x, b.y, e.x, e.y) <= b.radius * b.radius) this.damage(e, b.dps * dt, b.x, b.y, false, null, true);
      }
    }
  }

  /** Applies damage from a source position. Returns true if the enemy died. */
  damage(e: Enemy, amount: number, sx: number, sy: number, ignoreShield: boolean, source: Tower | null, quiet = false): boolean {
    if (e.hp <= 0) return false;
    if (e.kind === 'warden') {
      const from = Math.atan2(sy - e.y, sx - e.x);
      if (Math.abs(angleDiff(from, e.shieldAngle)) < Math.PI / 3) {
        if (!quiet) this.effects.push({ kind: 'block', x: e.x, y: e.y, t: 0, life: 0.15 });
        return false;
      }
    }
    if (e.kind === 'shielded' && !ignoreShield && e.hp > e.maxHp * 0.5) amount *= 0.25;
    if (this.run.time < e.vulnUntil) amount *= 1.5;
    e.hp -= amount;
    if (!quiet) e.hitFlash = 0.08;
    if (e.hp <= 0) {
      this.kill(e, source);
      return true;
    }
    return false;
  }

  private kill(e: Enemy, source: Tower | null): void {
    this.anyDead = true;
    const scrap = e.scrap * this.scrapMult();
    this.run.scrap += scrap;
    this.run.scrapEarned += scrap;
    this.run.kills++;
    this.meta.totalKills++;
    if (source) source.kills++;
    this.effects.push({ kind: 'boom', x: e.x, y: e.y, radius: e.size * 1.6, color: e.boss ? '#ff5cf0' : '#ff4f7b', t: 0, life: e.boss ? 0.8 : 0.3 });
    if (e.boss) {
      this.run.lastBossCleared = Math.max(this.run.lastBossCleared, e.wave);
      this.events.push({ type: 'bossKill', wave: e.wave });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        this.effects.push({ kind: 'spark', x: e.x, y: e.y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220, color: '#ff5cf0', t: 0, life: 0.7 });
      }
    }
  }

  private updateEffects(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.t += dt;
      if (fx.kind === 'spark') {
        fx.x += fx.vx * dt;
        fx.y += fx.vy * dt;
      }
      if (fx.t >= fx.life) this.effects.splice(i, 1);
    }
    if (this.effects.length > 400) this.effects.splice(0, this.effects.length - 400);
  }

  private updateAutomation(dt: number): void {
    const run = this.run;
    const s = this.meta.settings;
    const timers = run.autoTimers;
    if (this.node('autobuild') > 0 && s.autoBuild) {
      timers.build += dt;
      if (timers.build >= 2) {
        timers.build = 0;
        this.build();
      }
    }
    if (this.node('automerge') > 0 && s.autoMerge) {
      timers.merge += dt;
      if (timers.merge >= 1) {
        timers.merge = 0;
        const pair = this.findMergePair();
        if (pair) this.merge(pair[0], pair[1]);
      }
    }
    if (this.node('autoupgrade') > 0 && s.autoUpgrade) {
      timers.upgrade += dt;
      if (timers.upgrade >= 1) {
        timers.upgrade = 0;
        this.autoUpgrade();
      }
    }
  }

  /** Buys the cheapest affordable upgrade, keeping half the Scrap for building. */
  autoUpgrade(scrapShare = 0.5): boolean {
    let best: UpgradeDef | null = null;
    let bestCost = Infinity;
    for (const u of RUN_UPGRADES) {
      if (this.up(u.id) >= u.max) continue;
      const cost = this.upgradeCost(u);
      const budget = u.currency === 'scrap' ? this.run.scrap * scrapShare : this.run.spin;
      if (cost <= budget && cost < bestCost) { best = u; bestCost = cost; }
    }
    return best ? this.buyUpgrade(best.id) : false;
  }

  /** Debug: jump ahead a number of waves. */
  skipWaves(n: number): void {
    this.enemies = [];
    this.projectiles = [];
    this.startWave(this.run.wave + n);
  }

  nextMilestone(): string | null {
    const m = MILESTONES.find((x) => this.meta.collapses < x.collapses);
    return m ? `${m.collapses} Collapses: ${m.desc}` : null;
  }
}

export function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function angleDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
