// Bundles the game into a single self-contained index.html (dist/), and copies it into
// the Android app's assets so the APK and the browser build are always the same file.
import { build, context } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const watch = process.argv.includes('--watch');
const androidAssets = join(root, 'android/app/src/main/assets');

const options = {
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  minify: !watch,
  format: 'iife',
  target: ['chrome100'],
  write: false,
  sourcemap: watch ? 'inline' : false,
};

function emit(result) {
  const js = result.outputFiles[0].text;
  const css = readFileSync(join(root, 'src/style.css'), 'utf8');
  const html = readFileSync(join(root, 'src/index.html'), 'utf8')
    .replace('/*__STYLE__*/', () => css)
    .replace('/*__SCRIPT__*/', () => js.replace(/<\/script/gi, '<\\/script'));
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist/index.html'), html);
  mkdirSync(androidAssets, { recursive: true });
  copyFileSync(join(root, 'dist/index.html'), join(androidAssets, 'index.html'));
  console.log(`built dist/index.html (${(html.length / 1024).toFixed(1)} KB)`);
}

if (watch) {
  const ctx = await context({ ...options, plugins: [{ name: 'emit', setup(b) { b.onEnd((r) => r.errors.length || emit(r)); } }] });
  await ctx.watch();
  console.log('watching for changes…');
} else {
  emit(await build(options));
}
