import { ACHIEVEMENTS } from '../core/achievements';
import { COLLAPSE_WAVE, CORE_NODES, MILESTONES, RUN_UPGRADES, TOWERS, WAVE } from '../core/defs';
import { fmt, fmtTime, roman } from '../core/format';
import type { Game } from '../core/game';
import type { SlotRef } from '../core/state';

export interface UiHost {
  game: Game;
  selected: SlotRef | null;
  select(ref: SlotRef | null): void;
  save(): void;
  exportSave(): string;
  importSave(text: string): boolean;
  hardReset(): void;
  setSpeed(mult: number): void;
  speed: number;
  haptic(pattern: number | number[]): void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

type Tab = 'build' | 'upgrades' | 'core' | 'stats';

export class Ui {
  private tab: Tab = 'build';
  private upgradeRows = new Map<string, { row: HTMLElement; lvl: HTMLElement; btn: HTMLButtonElement }>();
  private nodeRows = new Map<string, { row: HTMLElement; lvl: HTMLElement; btn: HTMLButtonElement; req: HTMLElement }>();
  private statsTimer = 0;
  private coreKey = '';
  private n = (v: number) => fmt(v, this.host.game.meta.settings.notation);

  constructor(private host: UiHost) {
    document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => {
      b.addEventListener('click', () => this.showTab(b.dataset.tab as Tab));
    });
    $('holdBtn').addEventListener('click', () => {
      const run = this.host.game.run;
      run.holdWave = !run.holdWave;
    });
    this.buildBuildTab();
    this.buildUpgradesTab();
    this.rebuildCoreTab();
  }

  get game(): Game {
    return this.host.game;
  }

  showTab(tab: Tab): void {
    this.tab = tab;
    document.querySelectorAll<HTMLButtonElement>('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    for (const t of ['build', 'upgrades', 'core', 'stats']) $(`tab-${t}`).classList.toggle('hidden', t !== tab);
    if (tab === 'stats') this.renderStats();
    if (tab === 'core') this.rebuildCoreTab();
  }

  // ---------- Build tab ----------

  private buildBuildTab(): void {
    const tab = $('tab-build');
    tab.innerHTML = `
      <div class="build-row">
        <button class="btn primary" id="buildBtn">Build tower<small id="buildCost"></small></button>
        <button class="btn hidden" id="bulkBtn">×1</button>
      </div>
      <div class="collapse-card" id="collapseCard">
        <div class="txt" id="collapseTxt"></div>
        <button class="btn core" id="collapseBtn">Collapse</button>
      </div>
      <div class="section-title hidden" id="autoTitle">Automation</div>
      <div class="toggles" id="autoToggles"></div>
      <div class="section-title">How to play</div>
      <div class="desc" style="font-size:12.5px;color:var(--muted)">
        Towers orbit the core and fire on their own. Drag a tower onto another of the same
        <b>shape and colour</b> to merge them into the next tier. Drag a tower to an empty slot to move it.
        Or tap a tower, then tap a glowing match. Rings slow down while you aim. Tap the core for Overdrive. Each full orbit earns Spin.
      </div>`;
    $('buildBtn').addEventListener('click', () => {
      const bulk = this.game.milestone(3) ? this.game.meta.settings.bulk : 1;
      this.game.buildMany(bulk);
    });
    $('bulkBtn').addEventListener('click', () => {
      const s = this.game.meta.settings;
      s.bulk = s.bulk === 1 ? 5 : s.bulk === 5 ? 0 : 1;
    });
    $('collapseBtn').addEventListener('click', () => this.confirmCollapse());
  }

  private updateBuildTab(): void {
    const g = this.game;
    const s = g.meta.settings;
    const bulk = g.milestone(3) ? s.bulk : 1;
    const full = g.emptySlot() === null;
    const btn = $<HTMLButtonElement>('buildBtn');
    btn.disabled = !g.canBuild();
    const types = g.unlockedTypes().map((t) => TOWERS[t].name).join(', ');
    $('buildCost').innerHTML = full
      ? 'Board full: merge to free a slot'
      : `<span class="cost scrap">${this.n(g.buildCost())}</span> · random: ${types}`;
    btn.firstChild!.textContent = bulk === 1 ? 'Build tower' : bulk === 5 ? 'Build ×5' : 'Build max';
    const bulkBtn = $('bulkBtn');
    bulkBtn.classList.toggle('hidden', !g.milestone(3));
    bulkBtn.textContent = bulk === 1 ? '×1' : bulk === 5 ? '×5' : 'Max';

    const card = $('collapseCard');
    const ready = g.canCollapse();
    card.classList.toggle('ready', ready);
    $<HTMLButtonElement>('collapseBtn').disabled = !ready;
    if (ready) {
      const gain = g.collapseGain();
      const next = Math.ceil(g.run.maxWave * Math.cbrt(1.5));
      $('collapseTxt').innerHTML = `<b>Collapse for +${this.n(gain)} Cores</b>Reach wave ${next} for 50% more. Resets the run.`;
    } else {
      $('collapseTxt').innerHTML = `<b>Collapse at wave ${COLLAPSE_WAVE}</b>Best this run: wave ${g.run.maxWave}. Cores buy permanent upgrades.`;
    }

    const autos: [string, 'autoBuild' | 'autoMerge' | 'autoUpgrade', string][] = [
      ['autobuild', 'autoBuild', 'Auto-Build'],
      ['automerge', 'autoMerge', 'Auto-Merge'],
      ['autoupgrade', 'autoUpgrade', 'Auto-Upgrade'],
    ];
    const box = $('autoToggles');
    const owned = autos.filter(([id]) => g.node(id) > 0);
    $('autoTitle').classList.toggle('hidden', owned.length === 0);
    if (box.childElementCount !== owned.length) {
      box.innerHTML = '';
      for (const [, key, label] of owned) {
        const b = el('button', 'btn small');
        b.dataset.key = key;
        b.textContent = label;
        b.addEventListener('click', () => { s[key] = !s[key]; });
        box.appendChild(b);
      }
    }
    box.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const on = s[b.dataset.key as 'autoBuild'];
      b.classList.toggle('on', on);
      b.textContent = `${b.textContent!.split(':')[0]}: ${on ? 'on' : 'off'}`;
    });
  }

  // ---------- Upgrades tab ----------

  private buildUpgradesTab(): void {
    const tab = $('tab-upgrades');
    tab.innerHTML = '';
    for (const currency of ['scrap', 'spin'] as const) {
      tab.appendChild(el('div', 'section-title', currency === 'scrap' ? 'Scrap upgrades' : 'Spin upgrades (earned from orbits)'));
      const list = el('div', 'list');
      for (const u of RUN_UPGRADES.filter((x) => x.currency === currency)) {
        const row = el('div', 'item');
        const info = el('div', 'info');
        const name = el('div', 'name', u.name);
        const lvl = el('span', 'lvl');
        name.appendChild(lvl);
        info.append(name, el('div', 'desc', u.desc));
        const btn = el('button', 'btn small');
        btn.addEventListener('click', () => this.game.buyUpgrade(u.id));
        row.append(info, btn);
        list.appendChild(row);
        this.upgradeRows.set(u.id, { row, lvl, btn });
      }
      tab.appendChild(list);
    }
  }

  private updateUpgradesTab(): void {
    const g = this.game;
    for (const u of RUN_UPGRADES) {
      const r = this.upgradeRows.get(u.id)!;
      const level = g.up(u.id);
      r.lvl.textContent = u.max === Infinity ? `Lv ${level}` : `Lv ${level}/${u.max}`;
      const maxed = level >= u.max;
      r.row.classList.toggle('maxed', maxed);
      r.btn.disabled = !g.canBuyUpgrade(u);
      r.btn.classList.toggle('afford', !r.btn.disabled);
      r.btn.innerHTML = maxed ? 'Max' : `<span class="cost ${u.currency}">${this.n(g.upgradeCost(u))}</span>`;
    }
  }

  // ---------- Core tab ----------

  private rebuildCoreTab(): void {
    const g = this.game;
    const tab = $('tab-core');
    this.coreKey = `${g.meta.collapses}`;
    tab.innerHTML = '';
    this.nodeRows.clear();
    if (g.meta.collapses === 0) {
      tab.appendChild(el('div', 'desc', `<p style="color:var(--muted)">Reach wave ${COLLAPSE_WAVE} and <b>Collapse</b> (on the Build tab) to earn Cores. Cores buy permanent upgrades here: more damage, more Scrap, a third ring, a new tower and automation.</p>`));
    }
    tab.appendChild(el('div', 'section-title', `Core tree · <span class="cost cores" id="coreCount"></span>`));
    const list = el('div', 'list');
    for (const n of CORE_NODES) {
      const row = el('div', 'item');
      const info = el('div', 'info');
      const name = el('div', 'name', `${n.name}<span class="branch">${n.branch}</span>`);
      const lvl = el('span', 'lvl');
      name.appendChild(lvl);
      const req = el('div', 'desc');
      info.append(name, el('div', 'desc', n.desc), req);
      const btn = el('button', 'btn small');
      btn.addEventListener('click', () => { if (this.game.buyNode(n.id)) this.updateCoreTab(); });
      row.append(info, btn);
      list.appendChild(row);
      this.nodeRows.set(n.id, { row, lvl, btn, req });
    }
    tab.appendChild(list);
    tab.appendChild(el('div', 'section-title', 'Collapse milestones'));
    const ms = el('div', 'list');
    for (const m of MILESTONES) {
      const got = g.meta.collapses >= m.collapses;
      ms.appendChild(el('div', `item ${got ? '' : 'locked'}`, `<div class="info"><div class="name">${m.collapses} Collapse${m.collapses > 1 ? 's' : ''}${got ? ' ✓' : ''}</div><div class="desc">${m.desc}</div></div>`));
    }
    tab.appendChild(ms);
    this.updateCoreTab();
  }

  private updateCoreTab(): void {
    const g = this.game;
    if (this.coreKey !== `${g.meta.collapses}`) { this.rebuildCoreTab(); return; }
    const count = document.getElementById('coreCount');
    if (count) count.textContent = `${this.n(g.meta.cores)} Cores`;
    for (const n of CORE_NODES) {
      const r = this.nodeRows.get(n.id)!;
      const level = g.node(n.id);
      const available = g.nodeAvailable(n);
      r.lvl.textContent = n.max > 1 ? `Lv ${level}/${n.max}` : level ? '✓' : '';
      r.row.classList.toggle('locked', !available);
      const maxed = level >= n.max;
      r.btn.disabled = !g.canBuyNode(n);
      r.btn.classList.toggle('afford-core', !r.btn.disabled);
      r.btn.innerHTML = maxed ? 'Owned' : `<span class="cost cores">${this.n(g.nodeCost(n))}</span>`;
      r.req.textContent = available ? '' : `Requires ${n.requires.map((q) => `${CORE_NODES.find((x) => x.id === q.id)!.name}${q.level > 1 ? ` ${q.level}` : ''}`).join(', ')}`;
    }
  }

  // ---------- Stats tab ----------

  private renderStats(): void {
    const g = this.game;
    const m = g.meta;
    const s = m.settings;
    const tab = $('tab-stats');
    const dmg = g.damageMult();
    tab.innerHTML = `
      <div class="stats-grid">
        <div>Best wave<b>${m.bestWave}</b></div>
        <div>Collapses<b>${m.collapses}</b></div>
        <div>Damage multiplier<b>×${this.n(dmg)}</b></div>
        <div>Scrap multiplier<b>×${this.n(g.scrapMult())}</b></div>
        <div>Enemies destroyed<b>${this.n(m.totalKills)}</b></div>
        <div>Merges<b>${this.n(m.totalMerges)}</b></div>
        <div>Highest tier<b>${roman(m.highestTier)}</b></div>
        <div>Time played<b>${fmtTime(m.totalTime)}</b></div>
      </div>
      <div class="section-title">Achievements · ${m.achievements.length}/${ACHIEVEMENTS.length} · each ×1.02 damage</div>
      <div class="ach">${ACHIEVEMENTS.map((a) => `<div class="${m.achievements.includes(a.id) ? 'got' : ''}"><b>${a.name}</b>${a.desc}</div>`).join('')}</div>
      <div class="section-title">Settings</div>
      <div class="settings">
        <button class="btn small" data-act="notation">Numbers: ${s.notation === 'letters' ? '1.5M' : '1.5e6'}</button>
        <button class="btn small ${s.reduceMotion ? 'on' : ''}" data-act="motion">Reduce motion: ${s.reduceMotion ? 'on' : 'off'}</button>
        <button class="btn small ${s.haptics ? 'on' : ''}" data-act="haptics">Vibration: ${s.haptics ? 'on' : 'off'}</button>
        <button class="btn small" data-act="export">Export save</button>
        <button class="btn small" data-act="import">Import save</button>
        <button class="btn small" data-act="reset">Reset game</button>
        <button class="btn small ${s.debug ? 'on' : ''}" data-act="debug">Debug: ${s.debug ? 'on' : 'off'}</button>
      </div>
      <div class="debug ${s.debug ? '' : 'hidden'}">
        <button class="btn small" data-act="scrap">+Scrap ×100</button>
        <button class="btn small" data-act="spin">+1,000 Spin</button>
        <button class="btn small" data-act="waves">Skip 10 waves</button>
        <button class="btn small" data-act="cores">+50 Cores</button>
        <button class="btn small" data-act="speed">Speed ×${this.host.speed}</button>
      </div>
      <p style="color:var(--muted);font-size:11px;margin-top:14px">Core Breach prototype v0.1</p>`;
    tab.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((b) => b.addEventListener('click', () => this.settingAction(b.dataset.act!)));
  }

  private settingAction(act: string): void {
    const g = this.game;
    const s = g.meta.settings;
    switch (act) {
      case 'notation': s.notation = s.notation === 'letters' ? 'scientific' : 'letters'; break;
      case 'motion': s.reduceMotion = !s.reduceMotion; break;
      case 'haptics': s.haptics = !s.haptics; break;
      case 'debug': s.debug = !s.debug; break;
      case 'export': this.showExport(); return;
      case 'import': this.showImport(); return;
      case 'reset': this.confirmReset(); return;
      case 'scrap': g.run.scrap = Math.max(100, g.run.scrap * 100); break;
      case 'spin': g.run.spin += 1000; break;
      case 'waves': g.skipWaves(10); break;
      case 'cores': g.meta.cores += 50; break;
      case 'speed': this.host.setSpeed(this.host.speed >= 10 ? 1 : this.host.speed * (this.host.speed === 1 ? 3 : 10 / 3)); break;
    }
    this.renderStats();
  }

  // ---------- Top bar, goal, card ----------

  update(dt: number): void {
    const g = this.game;
    const run = g.run;
    $('scrap').textContent = this.n(run.scrap);
    $('spin').textContent = this.n(run.spin);
    const showCores = g.meta.collapses > 0 || g.meta.cores > 0;
    $('coresBox').classList.toggle('hidden', !showCores);
    $('cores').textContent = this.n(g.meta.cores);
    $('wave').textContent = String(run.wave);
    $('best').textContent = run.maxWave > run.wave ? ` / ${run.maxWave}` : '';
    $<HTMLElement>('waveBar').style.width = `${Math.min(100, (run.waveTime / WAVE.maxDuration) * 100)}%`;
    $('integrity').textContent = String(Math.max(0, Math.ceil(run.integrity)));
    $<HTMLElement>('integrityBar').style.width = `${Math.max(0, (run.integrity / g.maxIntegrity()) * 100)}%`;
    const hold = $('holdBtn');
    hold.setAttribute('aria-pressed', String(run.holdWave));
    hold.textContent = run.holdWave ? 'Holding wave' : 'Hold wave';
    const hint = $('overdriveHint');
    if (run.overdriveTime > 0) {
      hint.textContent = `Overdrive ${Math.ceil(run.overdriveTime)}s`;
      hint.classList.add('ready');
    } else if (g.overdriveReady()) {
      hint.textContent = 'Tap core: Overdrive';
      hint.classList.add('ready');
    } else {
      hint.textContent = `Overdrive in ${Math.ceil(run.overdriveCooldown)}s`;
      hint.classList.remove('ready');
    }
    $('coreTabBtn').classList.toggle('badge', CORE_NODES.some((n) => g.canBuyNode(n)));

    this.updateGoal();
    this.updateCard();
    if (this.tab === 'build') this.updateBuildTab();
    if (this.tab === 'upgrades') this.updateUpgradesTab();
    if (this.tab === 'core') this.updateCoreTab();
    if (this.tab === 'stats') {
      this.statsTimer += dt;
      if (this.statsTimer > 2) { this.statsTimer = 0; this.renderStats(); }
    }
  }

  private updateGoal(): void {
    const g = this.game;
    const goal = $('goal');
    const m = g.meta;
    let tutorial = '';
    if (m.collapses === 0) {
      if (g.run.builds === 0 && m.totalMerges === 0) tutorial = 'Tap <b>Build tower</b> below. Towers orbit the core and shoot on their own.';
      else if (m.totalMerges === 0 && g.findMergePair()) tutorial = 'Drag a tower onto one with the <b>same shape and colour</b>, or tap one and then tap a glowing match.';
      else if (m.totalMerges === 0) tutorial = 'Keep building. When two towers match, drag one onto the other to merge.';
      else if (m.overdrives === 0 && g.run.wave >= 4) tutorial = 'Tap the glowing <b>core</b> for Overdrive: rings spin 3× faster for 10 s.';
      else if (Object.keys(g.run.upgrades).length === 0 && g.run.wave >= 6) tutorial = 'Spend Scrap and Spin in the <b>Upgrades</b> tab.';
    }
    goal.classList.toggle('tutorial', !!tutorial);
    if (tutorial) { goal.innerHTML = tutorial; return; }
    if (!g.canCollapse()) {
      goal.innerHTML = `Next goal: <b>wave ${COLLAPSE_WAVE}</b> unlocks Collapse (best ${g.run.maxWave})`;
    } else {
      const nm = g.nextMilestone();
      goal.innerHTML = `Collapse ready: <b>+${this.n(g.collapseGain())} Cores</b>${nm ? ` · next: ${nm}` : ''}`;
    }
  }

  private cardKey = '';

  private updateCard(): void {
    const card = $('card');
    const ref = this.host.selected;
    const t = ref ? this.game.tower(ref) : null;
    if (!ref || !t) {
      card.classList.add('hidden');
      this.cardKey = '';
      return;
    }
    card.classList.remove('hidden');
    const def = TOWERS[t.type];
    const key = `${t.id}:${t.tier}`;
    if (key !== this.cardKey) {
      this.cardKey = key;
      card.innerHTML = `
        <h3><span style="color:${def.color}">●</span>${def.name} ${roman(t.tier)}<span class="role">${def.role} · Ring ${ref.ring + 1}</span><button class="close" id="cardClose">×</button></h3>
        <div class="statline">Dmg <b id="cDmg"></b> · DPS <b id="cDps"></b> · Range <b>${Math.round(this.game.towerRange(t))}</b> · Kills <b id="cKills"></b></div>
        <div class="perk ${t.tier >= 5 ? 'on' : ''}">V: ${def.perk5}${t.tier >= 5 ? ' ✓' : ''} · X: ${def.perk10}${t.tier >= 10 ? ' ✓' : ''}</div>
        <div class="row">
          <button class="btn small primary" id="cardMerge"></button>
          <button class="btn small danger" id="cardSell"></button>
        </div>`;
      $('cardClose').addEventListener('click', () => this.host.select(null));
      $('cardSell').addEventListener('click', () => {
        const r = this.host.selected;
        if (r) { this.game.sell(r); this.host.select(null); }
      });
      $('cardMerge').addEventListener('click', () => {
        const r = this.host.selected;
        if (!r) return;
        const into = this.game.mergeTargets(r)[0];
        if (into && this.game.merge(r, into)) {
          this.host.haptic(18);
          this.host.select(this.game.mergeTargets(into).length > 0 ? into : null);
        }
      });
    }
    $('cDmg').textContent = this.n(this.game.towerDamage(t));
    $('cDps').textContent = this.n(this.game.towerDps(t));
    $('cKills').textContent = this.n(t.kills);
    const matches = this.game.mergeTargets(ref).length;
    const mergeBtn = $<HTMLButtonElement>('cardMerge');
    mergeBtn.disabled = matches === 0;
    mergeBtn.textContent = t.tier >= 10 ? 'Max tier' : matches ? `Merge with match (${matches})` : 'No match yet';
    $('cardSell').innerHTML = `Sell for <span class="cost scrap">${this.n(this.game.sellValue(ref))}</span>`;
  }

  // ---------- Toasts and modals ----------

  toast(text: string, kind: '' | 'gold' | 'bad' | 'good' = ''): void {
    const box = $('toasts');
    const t = el('div', `toast ${kind}`, text);
    box.appendChild(t);
    while (box.childElementCount > 3) box.firstElementChild!.remove();
    setTimeout(() => t.remove(), 2700);
  }

  modal(html: string, buttons: { label: string; cls?: string; action?: () => void }[]): void {
    const box = $('modalBox');
    box.innerHTML = html;
    const row = el('div', 'row');
    for (const b of buttons) {
      const btn = el('button', `btn ${b.cls ?? ''}`, b.label);
      btn.addEventListener('click', () => { this.closeModal(); b.action?.(); });
      row.appendChild(btn);
    }
    box.appendChild(row);
    $('modal').classList.remove('hidden');
  }

  closeModal(): void {
    $('modal').classList.add('hidden');
  }

  private confirmCollapse(): void {
    const g = this.game;
    if (!g.canCollapse()) return;
    const gain = g.collapseGain();
    const first = g.meta.collapses === 0;
    this.modal(
      `<h2>Collapse the core?</h2>
       <div class="big">+${this.n(gain)} Cores</div>
       <p>Resets Scrap, Spin, towers, run upgrades and the wave. Cores, the Core tree and achievements are kept.</p>
       ${first ? '<p>Spend Cores in the <b>Core</b> tab. Start with <b>Ignition</b>: ×2 damage and ×2 Scrap.</p>' : ''}`,
      [
        { label: 'Not yet' },
        { label: 'Collapse', cls: 'core', action: () => { this.host.select(null); g.collapse(); this.host.save(); this.showTab('core'); } },
      ],
    );
  }

  private confirmReset(): void {
    this.modal('<h2>Reset everything?</h2><p>This deletes all progress, including Cores and achievements. It cannot be undone.</p>', [
      { label: 'Cancel' },
      { label: 'Reset', cls: 'danger', action: () => this.host.hardReset() },
    ]);
  }

  private showExport(): void {
    const text = this.host.exportSave();
    this.modal(`<h2>Export save</h2><p>Copy this text somewhere safe.</p><textarea id="exportText" readonly>${text}</textarea>`, [
      { label: 'Copy', cls: 'primary', action: () => { navigator.clipboard?.writeText(text).catch(() => undefined); this.toast('Save copied'); } },
      { label: 'Close' },
    ]);
    const ta = $<HTMLTextAreaElement>('exportText');
    ta.addEventListener('focus', () => ta.select());
  }

  private showImport(): void {
    this.modal('<h2>Import save</h2><p>Paste an exported save. Your current progress will be replaced.</p><textarea id="importText"></textarea>', [
      { label: 'Cancel' },
      { label: 'Import', cls: 'primary', action: () => {
        const ok = this.host.importSave($<HTMLTextAreaElement>('importText').value.trim());
        this.toast(ok ? 'Save imported' : 'That save could not be read', ok ? 'good' : 'bad');
      } },
    ]);
  }

  welcomeBack(seconds: number, scrap: number, spin: number): void {
    this.modal(
      `<h2>Welcome back</h2><p>You were away for ${fmtTime(seconds)}. Your towers kept working at half speed.</p>
       <p><span class="cost scrap">${this.n(scrap)}</span> Scrap &nbsp; <span class="cost spin">${this.n(spin)}</span> Spin</p>`,
      [{ label: 'Collect', cls: 'primary' }],
    );
  }
}
