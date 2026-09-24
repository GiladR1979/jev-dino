import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const manifest = JSON.parse(
  readFileSync(new URL('source-manifest.json', import.meta.url)),
);
for (const f of manifest.files) {
  const actual = createHash('sha256')
    .update(readFileSync(new URL(f.file, import.meta.url)))
    .digest('hex');
  if (actual !== f.sha256) throw Error('Upstream file modified: ' + f.file);
}
console.log(
  `${manifest.files.length} original files match the SHA-256 manifest for Chromium ${manifest.chrome_version}.`,
);
