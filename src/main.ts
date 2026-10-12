import { roman } from './core/format';
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
    new ResizeObserver(() => this.renderer.resize()).observe(canvas);
    this.renderer.resize();
    if (loaded.offline > 0) this.grantOffline(loaded.offline);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.hiddenAt = Date.now();
        this.save();
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
    for (const e of this.game.events) {
      switch (e.type) {
        case 'merge':
          if (e.tier >= 5) this.ui.toast(`Tier ${roman(e.tier)} reached!`, 'gold');
          break;
        case 'bossKill':
          this.ui.toast(`Boss destroyed on wave ${e.wave}`, 'good');
          this.haptic(60);
          break;
        case 'breach':
          this.ui.toast(`Core breached! Back to wave ${e.toWave}`, 'bad');
          this.haptic([80, 40, 80]);
          break;
        case 'achievement':
          this.ui.toast(`Achievement: ${e.name} (×1.02 damage)`, 'gold');
          break;
        case 'wave':
          if (e.wave % 10 === 0) this.ui.toast(`Wave ${e.wave}: boss incoming`, 'bad');
          else if (e.rush) this.ui.toast(`Wave ${e.wave}: Rush! Faster enemies`, 'bad');
          break;
        case 'collapse':
          this.ui.toast(`Collapsed for ${e.cores} Cores`, 'good');
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
