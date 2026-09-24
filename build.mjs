import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const shim = fileURLToPath(new URL('./src/environment.ts', import.meta.url));
await build({
  entryPoints: ['src/controller.ts'],
  outfile: 'public/app.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  sourcemap: true,
  plugins: [
    {
      name: 'chromium-host-adapters',
      setup(b) {
        b.onResolve({ filter: /^@chromium\/offline$/ }, () => ({
          path: fileURLToPath(
            new URL('./src/chromium/offline.ts', import.meta.url),
          ),
        }));
        b.onResolve({ filter: /^chrome:\/\/resources\/js\// }, () => ({
          path: shim,
        }));
      },
    },
  ],
});
const audios = [
  ['press', 'button-press'],
  ['hit', 'hit'],
  ['reached', 'score-reached'],
]
  .map(
    ([id, file]) =>
      `<audio id="offline-sound-${id}" src="data:audio/mpeg;base64,${readFileSync(`public/assets/sounds/${file}.mp3`).toString('base64')}"></audio>`,
  )
  .join('');
writeFileSync(
  'public/index.html',
  readFileSync('src/index.html', 'utf8').replace('AUDIO_TEMPLATE', audios),
);
