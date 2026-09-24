import { spawnSync } from 'node:child_process';
import { resolve, dirname, basename, join } from 'node:path';
import { existsSync } from 'node:fs';
const input = process.argv[2] && resolve(process.argv[2]);
if (!input || !input.endsWith('.webm') || !existsSync(input))
  throw new Error('Usage: npm run export-video -- recordings/run-...webm');
const output = join(dirname(input), basename(input, '.webm') + '.mp4');
const result = spawnSync(
  'ffmpeg',
  [
    '-n',
    '-i',
    input,
    '-vf',
    'fps=60',
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    output,
  ],
  { stdio: 'inherit' },
);
if (result.error)
  throw new Error('Install FFmpeg and make it available on PATH');
if (result.status !== 0)
  throw new Error('Video export failed; existing files are never overwritten');
console.log(`Exported ${output}`);
