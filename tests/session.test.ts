import test from 'node:test';
import assert from 'node:assert/strict';
import { DecisionSession, type Observation } from '../src/decision-session';
import { launchX } from '../src/timing';
import type { Game, Player } from '../src/game-adapter';
const state: Observation = {
  speed: 8,
  grounded: true,
  obstacle: { id: 1, type: 'cactusSmall', x: 400, y: 105, width: 17 },
};
function receipt(body: string, change = {}) {
  const input = JSON.parse(body);
  return new Response(
    JSON.stringify({
      runId: input.runId,
      sequence: input.sequence,
      obstacleId: input.obstacle?.id ?? null,
      action: 'jump',
      model: 'test',
      latencyMs: 40,
      usage: null,
      ...change,
    }),
  );
}
test('closed sessions ignore late responses and start no new requests', async () => {
  let resolve!: (r: Response) => void;
  let body = '';
  const session = new DecisionSession(async (_url, options) => {
    body = String(options!.body);
    return new Promise((r) => {
      resolve = r;
    });
  });
  const request = session.request(state);
  assert.equal(session.pending, 1);
  session.close();
  resolve(receipt(body));
  assert.equal(await request, null);
  assert.equal(await session.request(state), null);
  assert.equal(session.pending, 0);
  assert.equal(session.received, 0);
  assert.equal(session.sent, 1);
});
test('responses must match the exact run, sequence, and obstacle', async () => {
  for (const change of [
    { runId: 'run-0000000000000' },
    { sequence: 999 },
    { obstacleId: 99 },
    { action: 'unknown' },
    { latencyMs: -1 },
  ]) {
    const session = new DecisionSession(async (_url, options) =>
      receipt(String(options!.body), change),
    );
    await assert.rejects(session.request(state), /Invalid decision receipt/);
    assert.equal(session.pending, 0);
    assert.equal(session.received, 0);
  }
});
test('concurrency is capped at ten and all slots are released', async () => {
  const replies: (() => void)[] = [];
  const session = new DecisionSession(
    async (_url, options) =>
      new Promise((resolve) => {
        replies.push(() => resolve(receipt(String(options!.body))));
      }),
  );
  const requests = Array.from({ length: 10 }, () => session.request(state));
  assert.equal(await session.request(state), null);
  assert.equal(session.sent, 10);
  replies.reverse().forEach((resolve) => resolve());
  assert.equal((await Promise.all(requests)).filter(Boolean).length, 10);
  assert.equal(session.pending, 0);
  assert.equal(session.received, 10);
});
test('transport failure is surfaced and releases its slot', async () => {
  const session = new DecisionSession(async () => {
    throw new Error('offline');
  });
  await assert.rejects(session.request(state), /offline/);
  assert.equal(session.pending, 0);
});
test('jump forecasting leaves the live player and obstacle unchanged', () => {
  const player: Player = {
    xPos: 50,
    yPos: 100,
    jumping: false,
    ducking: false,
    draw() {},
    reset() {
      this.xPos = 50;
      this.yPos = 100;
      this.jumping = false;
    },
    startJump() {
      this.jumping = true;
      this.yPos = 50;
    },
    updateJump() {
      this.yPos++;
    },
  };
  const obstacle = {
    xPos: 400,
    yPos: 100,
    width: 17,
    typeConfig: { type: 'cactusSmall' as const },
  };
  const beforePlayer = { ...player };
  const beforeObstacle = structuredClone(obstacle);
  const game = {
    tRex: player,
    currentSpeed: 8,
    checkForCollision: () => false,
  } as unknown as Game;
  const launch = launchX(game, obstacle);
  assert.ok(Number.isFinite(launch));
  assert.deepEqual(player, beforePlayer);
  assert.deepEqual(obstacle, beforeObstacle);
});

// Native Window.fetch requires its receiver even when stored for injection.
test('default transport preserves the browser fetch receiver', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async function (this: typeof globalThis, _url, options) {
    assert.equal(this, globalThis);
    calls++;
    return receipt(String(options!.body));
  };
  try {
    const session = new DecisionSession();
    const result = await session.request(state);
    assert.equal(result?.action, 'jump');
    assert.equal(calls, 1);
    assert.equal(session.received, 1);
    assert.equal(session.pending, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
