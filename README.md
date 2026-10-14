# Core Breach

An orbit-defense incremental game for Android. Towers ride orbital rings around a core,
enemies spiral in from every side, and you merge matching towers to climb tiers. Reach
wave 50 to **Collapse** the core for Cores, which buy permanent upgrades in the Core tree.

This is the first playable prototype from the design doc. It covers the run and the first
prestige layer (Collapse).

## Install on your phone (Pixel 10 or any Android 8+ phone)

Every push to `main` builds a signed APK in GitHub Actions and publishes it as a GitHub Release.

1. On your phone, open
   **https://github.com/treyspoonamore1/Tower-Defense-Incremental/releases/latest**
   in Chrome.
2. Under **Assets**, tap **`core-breach.apk`** to download it.
3. When the download finishes, tap **Open** (or open it from the Files app → Downloads).
4. If Android says Chrome isn't allowed to install apps, tap **Settings**, turn on
   **Allow from this source**, then press back.
5. Tap **Install**. If Google Play Protect warns about an unknown developer, tap
   **More details → Install anyway** (the app is built from this repo and has not been
   through Play review).
6. Open **Core Breach** from your app drawer.

New builds install over the old one and keep your save, because every build is signed
with the same key.

Optional: with USB debugging on, `adb install -r core-breach.apk` works too.

## How to play

- **Build tower** places a random tower (Pulse, Arc or Frost) in the first empty slot.
- Towers orbit and fire on their own. Every full orbit earns **Spin**; kills earn **Scrap**.
- **Merge** two towers with the same shape and colour into the next tier (the number of
  sides = tier + 2). Rings slow to 15% speed while you aim, and there are three ways:
  - **Drag** one onto the other. Drops snap to the nearest match, so near-misses still merge.
  - **Tap** a tower, then tap one of its glowing matches.
  - Tap a tower and press **Merge with match** on its card.
- Drag a tower to an empty slot to move it. **Tap the core** for Overdrive (rings spin 3×).
- **Kill chains:** kills in quick succession build a Chain counter worth up to +50% Scrap.
- **Faster resets:** after your first Collapse, waves below half your best run at 3× speed
  (Catch-up, rising with more Collapses). The **Head Start** node starts runs up to 50 waves in,
  and from 5 Collapses you begin each run with a starter kit of towers.
- Enemies sprint across the empty outer arena, and the next wave starts as soon as only a few
  stragglers are left.
- Enemies get 1% faster every wave (up to 2.5×). Every 5th wave that isn't a boss wave is a
  **Rush**: enemies are 40% faster and arrive twice as quickly.
- Spend Scrap and Spin in **Upgrades**. Reach **wave 50** and **Collapse** for Cores, then buy
  permanent upgrades, a third ring, the Mortar and automation in the **Core** tab.
- The game earns Scrap and Spin at half rate while closed (up to 8 hours).
- Settings (Stats tab): sound, vibration, optional damage numbers, reduce motion, save
  export/import, and a debug panel (extra currency, skip waves, game speed).

## Development

Requires Node 22.

```bash
npm install
npm run dev        # rebuilds dist/index.html on change; open it in a browser
npm run check      # typecheck, unit tests and production build
npm run sim        # headless balance simulator: time to waves 10/50/100 and to each Collapse
```

The whole game builds to a single self-contained file, `dist/index.html`, which you can open
in any browser. `npm run build` also copies it into the Android app's assets.

### Layout

| Path | What it is |
| --- | --- |
| `src/core/` | Pure game logic with no DOM: data (`defs.ts`), simulation (`game.ts`), save state, formatting |
| `src/render/` | Canvas renderer, cached neon sprites and effects (shake, pickups, Collapse animation) |
| `src/audio/` | Sound effects, synthesized with WebAudio (no audio files) |
| `src/ui/` | DOM panels, touch input (drag to merge) |
| `tools/build.mjs` | esbuild bundle → single `dist/index.html` |
| `tools/sim.ts` | Balance simulator, also run in CI |
| `tests/` | Vitest unit tests |
| `android/` | Minimal Android app: a full-screen WebView that serves the game from its assets |
| `.github/workflows/android.yml` | CI: test, build, assemble the APK, publish a Release |

All balance numbers live in `src/core/defs.ts`.

### Android build

The Android app is a thin WebView wrapper (`MainActivity.java`) that loads
`assets/index.html` via `WebViewAssetLoader`, so saves in `localStorage` persist. To build
locally you need JDK 17 and the Android SDK:

```bash
npm run build
cd android && ./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release.apk
```

**Signing:** `android/keystore/core-breach-sideload.p12` (password `corebreach`) is a
throwaway key committed so every CI build can update the previous install. Do not use it
for a Play Store release; set `SIGNING_STORE_FILE`, `SIGNING_STORE_PASSWORD`,
`SIGNING_KEY_ALIAS` and `SIGNING_KEY_PASSWORD` from secrets instead.

## Differences from the design doc

- Built with TypeScript + HTML canvas in a WebView instead of Godot. It is quicker to iterate
  on, tests headlessly, and makes a ~70 KB game.
- Numbers use plain JavaScript doubles (fine up to 1e308, far beyond this prototype's range)
  rather than a `Big` type.
- Boss HP is 20× wave HP rather than 30×, enemies move about 30% faster and speed up 1% per
  wave (the doc said 0.5%), and Rush waves are new, after playtesting and simulator tuning. The simulator reaches wave 50 at about 21 minutes and wave 10 at about 4.
- Prototype content: 4 towers, 4 enemy types, Warden and Hive bosses, 8 run upgrades,
  11 Core tree nodes, 4 Collapse milestones and 20 achievements.
