import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  readdir,
  rm,
  symlink,
  realpath,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createApp } from '../server/app.mjs';
import { ArtifactStore, publicFile } from '../server/artifact-store.mjs';
import { JevClient } from '../server/jev-client.mjs';
import { readConfig } from '../server/config.mjs';
import { validateObservation } from '../server/validation.mjs';

const observation = {
  runId: 'run-1790258867455',
  sequence: 1,
  speed: 8,
  grounded: true,
  obstacle: { id: 1, type: 'cactusSmall', x: 400, y: 105, width: 17 },
};
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'jev-dino-'));
  await mkdir(join(root, 'public'));
  await writeFile(join(root, 'public', 'index.html'), '<h1>Dino</h1>');
  const store = new ArtifactStore(root);
  await store.initialize();
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, store };
}
async function start(t, options) {
  // Reserve an ephemeral port, then create the app with its exact host allowlist.
  const probe = http.createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  const server = createApp({ ...options, port });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  t.after(
    () =>
      new Promise((r) => {
        server.close(r);
        server.closeAllConnections();
      }),
  );
  const origin = `http://127.0.0.1:${port}`;
  return {
    origin,
    post: (path, body, headers = {}) =>
      fetch(origin + path, {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      }),
  };
}
test('observation validation rejects invalid data and drops extra fields', () => {
  assert.equal(
    validateObservation({ ...observation, extraMetadata: 'ignored' })
      .extraMetadata,
    undefined,
  );
  for (const change of [
    { speed: NaN },
    { sequence: 0 },
    { grounded: 'yes' },
    { obstacle: {} },
    { runId: '../../file' },
    { obstacle: { ...observation.obstacle, type: 'execute' } },
  ])
    assert.throws(
      () => validateObservation({ ...observation, ...change }),
      /Invalid observation/,
    );
});
test('HTTP boundary blocks cross-origin requests and DNS rebinding', async (t) => {
  let calls = 0;
  const { origin, post } = await start(t, {
    ...(await fixture(t)),
    client: {
      decide() {
        calls++;
      },
    },
  });
  assert.equal(
    (await post('/decision', observation, { Origin: 'https://evil.invalid' }))
      .status,
    403,
  );
  const rebound = await new Promise((resolve) => {
    const req = http.request(
      origin + '/decision',
      { method: 'POST', headers: { Host: 'evil.invalid', Origin: origin } },
      (res) => {
        res.resume();
        resolve(res.statusCode);
      },
    );
    req.end('{}');
  });
  assert.equal(rebound, 403);
  assert.equal(
    (await fetch(origin + '/decision', { method: 'POST', body: '{}' })).status,
    403,
  );
  assert.equal(
    (await post('/decision', observation, { 'Content-Type': 'text/plain' }))
      .status,
    415,
  );
  assert.equal(calls, 0);
});
test('validated decisions persist only receipts, with token usage', async (t) => {
  const f = await fixture(t);
  const { post } = await start(t, {
    ...f,
    client: {
      async decide(state) {
        assert.equal(state.extraMetadata, undefined);
        return {
          action: 'jump',
          model: 'test',
          latencyMs: 20,
          usage: { input_tokens: 617, output_tokens: 55 },
        };
      },
    },
  });
  const response = await post('/decision', {
    ...observation,
    extraMetadata: 'should-not-leave-browser',
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.obstacleId, 1);
  assert.equal(result.runId, observation.runId);
  const receipt = JSON.parse(
    (
      await readFile(join(f.root, 'evidence', 'decisions.jsonl'), 'utf8')
    ).trim(),
  );
  assert.equal(receipt.usage.input_tokens, 617);
  assert.equal(receipt.extraMetadata, undefined);
});
test('invalid state fails before any external request', async (t) => {
  const { post } = await start(t, {
    ...(await fixture(t)),
    client: {
      decide() {
        throw new Error('Must not call');
      },
    },
  });
  assert.equal(
    (await post('/decision', { ...observation, speed: -1 })).status,
    400,
  );
  assert.equal(
    (await post('/decision', { ...observation, extra: 'x'.repeat(33000) }))
      .status,
    413,
  );
});
test('API failures are sanitized and are not silently retried', async () => {
  let calls = 0;
  const client = new JevClient('test-only-placeholder', async () => {
    calls++;
    throw new Error('Sensitive upstream message');
  });
  await assert.rejects(
    client.decide(observation, new AbortController().signal),
    /JEV unavailable/,
  );
  assert.equal(calls, 1);
});
test('JEV accepts only bounded actions and numeric usage', async () => {
  const make = (payload) =>
    new JevClient(
      'test-only-placeholder',
      async () => new Response(JSON.stringify(payload)),
    );
  await assert.rejects(
    make({
      model: 'test',
      answers: { next_action: { choice: 'execute arbitrary script' } },
    }).decide(observation, new AbortController().signal),
  );
  const result = await make({
    model: 'test',
    answers: { next_action: { choice: 'duck' } },
    usage: { input_tokens: 99, output_tokens: 4 },
  }).decide(observation, new AbortController().signal);
  assert.deepEqual(result.usage, { input_tokens: 99, output_tokens: 4 });
});
test('missing credentials fail clearly without a network call', async () => {
  const client = new JevClient('', () => {
    throw new Error('Must not call');
  });
  await assert.rejects(
    client.decide(observation, new AbortController().signal),
    /Set TYPESAFE_API_KEY/,
  );
  assert.deepEqual(await readConfig({}), { port: 8794, key: '' });
  await assert.rejects(readConfig({ PORT: 'NaN' }), /PORT/);
});
test('static paths cannot escape root through traversal or symlinks', async (t) => {
  const { root } = await fixture(t);
  await writeFile(join(root, 'private.txt'), 'private');
  await symlink(join(root, 'private.txt'), join(root, 'public', 'link.txt'));
  await assert.rejects(publicFile(join(root, 'public'), '../private.txt'));
  await assert.rejects(publicFile(join(root, 'public'), 'link.txt'));
  assert.equal(
    await publicFile(join(root, 'public'), 'index.html'),
    await realpath(join(root, 'public', 'index.html')),
  );
});
test('recording writes never overwrite, and oversize partial files are removed', async (t) => {
  const { root, store } = await fixture(t);
  await store.recording(observation.runId, Readable.from(['video']));
  await assert.rejects(
    store.recording(observation.runId, Readable.from(['replacement'])),
  );
  assert.equal(
    await readFile(
      join(root, 'recordings', observation.runId + '.webm'),
      'utf8',
    ),
    'video',
  );
  await assert.rejects(
    store.recording('run-1790258867456', Readable.from(['oversize']), 2),
  );
  assert.deepEqual(await readdir(join(root, 'recordings')), [
    observation.runId + '.webm',
  ]);
  await assert.rejects(store.recording('../secret', Readable.from(['x'])));
});
test('run evidence rejects unsafe names and refuses accidental overwrites', async (t) => {
  const { store } = await fixture(t);
  await store.report({ runId: observation.runId, score: 10 });
  await assert.rejects(store.report({ runId: observation.runId, score: 20 }));
  await assert.rejects(store.report({ runId: '../secret' }));
});
