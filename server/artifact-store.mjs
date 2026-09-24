import {
  mkdir,
  writeFile,
  appendFile,
  unlink,
  realpath,
  stat,
} from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { artifactName, HttpError } from './validation.mjs';
export class ArtifactStore {
  constructor(root) {
    this.root = root;
  }
  async initialize() {
    await mkdir(join(this.root, 'evidence'), { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, 'recordings'), {
      recursive: true,
      mode: 0o700,
    });
  }
  async receipt(value) {
    await appendFile(
      join(this.root, 'evidence', 'decisions.jsonl'),
      JSON.stringify(value) + '\n',
      { mode: 0o600 },
    );
  }
  async report(value) {
    const name = artifactName(value.runId);
    await writeFile(
      join(this.root, 'evidence', name + '.json'),
      JSON.stringify(value, null, 2),
      { flag: 'wx', mode: 0o600 },
    );
  }
  async recording(name, input, limit = 1_000_000_000) {
    const file = artifactName(name) + '.webm';
    const target = join(this.root, 'recordings', file);
    let bytes = 0;
    let created = false;
    const output = createWriteStream(target, { flags: 'wx', mode: 0o600 });
    output.once('open', () => {
      created = true;
    });
    const limiter = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length;
        callback(
          bytes > limit ? new HttpError(413, 'Recording too large') : null,
          chunk,
        );
      },
    });
    try {
      await pipeline(input, limiter, output);
    } catch (error) {
      if (created) await unlink(target).catch(() => {});
      throw error;
    }
    return { file, bytes };
  }
}
/** Resolve symlinks as well as dot segments before exposing a file. */
export async function publicFile(base, relative) {
  const root = await realpath(base);
  const candidate = resolve(root, relative);
  if (!candidate.startsWith(root + sep)) throw new HttpError(404, 'Not found');
  try {
    const actual = await realpath(candidate);
    if (!actual.startsWith(root + sep) || !(await stat(actual)).isFile())
      throw new Error();
    return actual;
  } catch {
    throw new HttpError(404, 'Not found');
  }
}
