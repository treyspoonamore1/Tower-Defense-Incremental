import { Sfx } from './audio/sfx';
import { fmt, roman } from './core/format';
import { Game } from './core/game';
import type { SaveData, SlotRef } from './core/state';
import { Renderer, type UiState } from './render/renderer';
import { Input } from './ui/input';
import { Ui, type UiHost } from './ui/ui';

const SAVE_KEY = 'coreBreach.save.v1';
const AUTOSAVE_SECONDS = 15;

class App implements UiHost {
  game: Game;
  renderer: Renderer;
  input: Input;
  ui: Ui;
  uiState: UiState = { drag: null, selected: null, hover: null };
  speed = 1;
  sfx = new Sfx();
  private last = performance.now();
  private uiTimer = 0;
  private saveTimer = 0;
  private hiddenAt = 0;

  constructor() {
    const canvas = document.getElementById('cv') as HTMLCanvasElement;
    const loaded = this.load();
    this.game = loaded.game;
    this.renderer = new Renderer(canvas);
    this.ui = new Ui(this);
    this.input = new Input(canvas, this.renderer, {
      get game() { return app.game; },
      get ui() { return app.uiState; },
      select: (ref) => this.select(ref),
      haptic: (p) => this.haptic(p),
    });
    new ResizeObserver(() => { this.renderer.resize(); this.updatePickupTarget(); }).observe(canvas);
    this.renderer.resize();
    this.updatePickupTarget();
    this.renderer.onPickup = () => this.onPickup();
    // Audio can only start after a user gesture.
    const unlock = () => { if (this.game.meta.settings.sound) this.sfx.unlock(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    document.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.sfx.click();
    }, { capture: true });
    if (loaded.offline > 0) this.grantOffline(loaded.offline);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
        this.save();
        this.sfx.suspend();
      } else {
        const away = (Date.now() - this.hiddenAt) / 1000;
        this.last = performance.now();
        if (this.hiddenAt && away > 0) this.grantOffline(away);
      }
    });
    window.addEventListener('pagehide', () => this.save());
    (window as unknown as { coreBreachSave: () => void }).coreBreachSave = () => this.save();
    requestAnimationFrame((t) => this.frame(t));
  }

  get selected(): SlotRef | null {
    return this.uiState.selected;
  }

  private bumpAt = 0;

  /** Points Scrap pickups at the Scrap counter, which sits above the canvas. */
  private updatePickupTarget(): void {
    const canvas = document.getElementById('cv')!.getBoundingClientRect();
    const counter = document.getElementById('scrap')!.getBoundingClientRect();
    this.renderer.pickupTarget = { x: counter.left + counter.width / 2 - canvas.left, y: counter.top + counter.height / 2 - canvas.top };
  }

  private onPickup(): void {
    this.sfx.pickup();
    const now = performance.now();
    if (now - this.bumpAt < 90) return;
    this.bumpAt = now;
    document.getElementById('scrap')!.animate([{ transform: 'scale(1.25)', color: '#ffc857' }, { transform: 'scale(1)' }], { duration: 160 });
  }

  select(ref: SlotRef | null): void {
    this.uiState.selected = ref;
  }

  setSpeed(mult: number): void {
    this.speed = mult;
  }

  haptic(pattern: number | number[]): void {
    if (this.game.meta.settings.haptics && 'vibrate' in navigator) navigator.vibrate(pattern);
  }

  private frame(now: number): void {
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.game.aiming = this.input.holding || this.uiState.selected !== null;
    this.game.emitHits = this.game.meta.settings.damageNumbers;
    this.sfx.enabled = this.game.meta.settings.sound;
    this.game.update(dt * this.speed);
    this.handleEvents();
    if (this.uiState.selected && !this.game.tower(this.uiState.selected)) this.uiState.selected = null;
    this.input.refreshHover();
    this.renderer.draw(this.game, this.uiState, dt, this.game.meta.settings.reduceMotion);
    this.uiTimer += dt;
    if (this.uiTimer >= 0.12) {
      this.ui.update(this.uiTimer);
      this.uiTimer = 0;
    }
    this.saveTimer += dt;
    if (this.saveTimer >= AUTOSAVE_SECONDS) {
      this.saveTimer = 0;
      this.save();
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  private handleEvents(): void {
    const r = this.renderer;
    const calm = this.game.meta.settings.reduceMotion;
    for (const e of this.game.events) {
      switch (e.type) {
        case 'fire':
          this.sfx.fire(e.tower);
          break;
        case 'kill':
          this.sfx.kill(e.boss);
          r.addPickup(e.x, e.y);
          if (e.boss) for (let i = 0; i < 7; i++) r.addPickup(e.x + (Math.random() - 0.5) * 60, e.y + (Math.random() - 0.5) * 60);
          break;
        case 'hit':
          r.addText(e.x, e.y, fmt(e.amount, this.game.meta.settings.notation), 'rgba(255,255,255,0.9)');
          break;
        case 'build':
          this.sfx.build();
          break;
        case 'overdrive':
          this.sfx.overdrive();
          if (!calm) r.flash(0.18, '124,246,255');
          break;
        case 'merge':
          this.sfx.merge(e.tier);
          if (e.tier >= 5) {
            this.ui.toast(`Tier ${roman(e.tier)} reached!`, 'gold');
            r.shake(4 + e.tier);
            if (!calm) r.flash(0.12 + e.tier * 0.015);
          }
          break;
        case 'bossKill':
          this.ui.toast(`Boss destroyed on wave ${e.wave}`, 'good');
          this.haptic(60);
          r.shake(12);
          if (!calm) r.flash(0.2, '255,92,240');
          break;
        case 'breach':
          this.ui.toast(`Core breached! Back to wave ${e.toWave}`, 'bad');
          this.haptic([80, 40, 80]);
          this.sfx.breach();
          r.shake(16);
          if (!calm) r.flash(0.35, '255,59,107');
          break;
        case 'achievement':
          this.ui.toast(`Achievement: ${e.name} (×1.02 damage)`, 'gold');
          this.sfx.achievement();
          break;
        case 'wave':
          if (e.wave % 10 === 0) {
            this.ui.toast(`Wave ${e.wave}: boss incoming`, 'bad');
            this.sfx.bossWarning();
          } else if (e.rush) {
            this.ui.toast(`Wave ${e.wave}: Rush! Faster enemies`, 'bad');
            this.sfx.rush();
          }
          break;
        case 'collapse':
          this.ui.toast(`Collapsed for ${e.cores} Cores`, 'good');
          this.sfx.collapse();
          r.playCollapse();
          this.haptic([30, 60, 120]);
          break;
      }
    }
    this.game.events.length = 0;
  }

  private grantOffline(seconds: number): void {
    const report = this.game.applyOffline(seconds);
    if (report && (report.scrap > 0 || report.spin > 0)) this.ui.welcomeBack(report.seconds, report.scrap, report.spin);
  }

  private load(): { game: Game; offline: number } {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as SaveData;
        return { game: Game.fromSave(data), offline: Math.max(0, (Date.now() - data.lastSave) / 1000) };
      }
    } catch (err) {
      console.warn('Could not load save', err);
    }
    return { game: new Game(), offline: 0 };
  }

  save(): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.game.toSave()));
    } catch (err) {
      console.warn('Could not save', err);
    }
  }

  exportSave(): string {
    const json = JSON.stringify(this.game.toSave());
    return btoa(unescape(encodeURIComponent(json)));
  }

  importSave(text: string): boolean {
    try {
      const data = JSON.parse(decodeURIComponent(escape(atob(text)))) as SaveData;
      this.game = Game.fromSave(data);
      this.uiState.selected = null;
      this.save();
      return true;
    } catch {
      return false;
    }
  }

  hardReset(): void {
    this.game.hardReset();
    this.uiState.selected = null;
    this.save();
  }
}

const app = new App();
(window as unknown as { coreBreach: App }).coreBreach = app;
