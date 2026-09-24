import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

// Exercise the pinned Runner's real bound callbacks, without a browser or JEV.
const root = fileURLToPath(new URL('../', import.meta.url));
const bundled = await build({
  stdin: {
    contents: `
      export { Runner } from './src/chromium/offline.ts';
      export { createGame } from './src/game-adapter.ts';
    `,
    resolveDir: root,
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'adapter',
  plugins: [
    {
      name: 'test-chromium-host',
      setup(builder) {
        builder.onResolve({ filter: /^@chromium\/offline$/ }, () => ({
          path: fileURLToPath(
            new URL('../src/chromium/offline.ts', import.meta.url),
          ),
        }));
        builder.onResolve({ filter: /^chrome:\/\/resources\/js\// }, () => ({
          path: fileURLToPath(
            new URL('../src/environment.ts', import.meta.url),
          ),
        }));
      },
    },
  ],
});

class KeyEvent extends Event {
  constructor(type, keyCode) {
    super(type, { cancelable: true });
    this.keyCode = keyCode;
  }
}

function fixture({ intro = false, crashed = false } = {}) {
  const document = Object.assign(new EventTarget(), {
    documentElement: { dir: 'ltr' },
    title: 'Test game',
    hidden: false,
    visibilityState: 'visible',
  });
  const window = Object.assign(new EventTarget(), {
    navigator: { userAgent: 'test' },
    devicePixelRatio: 1,
  });
  const cancelledFrames = [];
  const context = {
    window,
    document,
    KeyboardEvent: KeyEvent,
    MouseEvent: Event,
    PointerEvent: Event,
    performance,
    cancelAnimationFrame: (id) => cancelledFrames.push(id),
  };
  runInNewContext(bundled.outputFiles[0].text, context);
  const { Runner, createGame } = context.adapter;
  const container = Object.assign(new EventTarget(), {
    style: {},
    getBoundingClientRect: () => ({ top: 0 }),
  });
  const activity = { resets: 0, jumps: 0, releases: 0, updates: 0 };
  const player = {
    yPos: 90,
    jumping: false,
    ducking: false,
    reset() {
      activity.resets++;
      this.yPos = 100;
    },
    update() {},
    startJump() {
      activity.jumps++;
      this.jumping = true;
      this.yPos = 50;
    },
    endJump() {
      activity.releases++;
      this.jumping = false;
    },
    setDuck(down) {
      this.ducking = down;
    },
  };
  const game = Object.assign(Object.create(Runner.prototype), {
    outerContainerEl: { inert: false },
    containerEl: container,
    canvas: new EventTarget(),
    tRex: player,
    config: { canvasInViewOffset: -10, gameoverClearTime: 0 },
    soundFx: {},
    currentSpeed: 8,
    distanceRan: 1200,
    playing: !crashed,
    paused: false,
    crashed,
    activated: !intro,
    playingIntro: intro,
    playCount: 0,
    raqId: 42,
    update() {
      activity.updates++;
      this.distanceRan++;
      this.raqId = 43;
    },
  });
  // Input listeners are already installed when initializeInstance returns.
  game.startListening();
  Runner.initializeInstance = () => game;
  assert.equal(createGame(), game);
  if (!intro) game.startGame();
  return { game, document, window, container, activity, cancelledFrames };
}

function lateEvents({ document, window, container }) {
  window.dispatchEvent(new Event('blur'));
  document.hidden = true;
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  document.hidden = false;
  document.visibilityState = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('focus'));
  for (const key of [32, 38, 40, 13]) {
    for (const type of ['keydown', 'keyup']) {
      const event = new KeyEvent(type, key);
      assert.equal(document.dispatchEvent(event), true);
      assert.equal(event.defaultPrevented, false);
    }
  }
  for (const type of ['pointerdown', 'pointerup']) {
    assert.equal(
      document.dispatchEvent(new Event(type, { cancelable: true })),
      true,
    );
  }
  container.dispatchEvent(new Event('touchstart'));
  container.dispatchEvent(new Event('touchend'));
}

test('terminal gate preserves active callbacks, then blocks late focus and input without consuming page controls', () => {
  const run = fixture();
  const { game, document, window, activity } = run;
  window.dispatchEvent(new Event('blur'));
  assert.equal(game.paused, true);
  window.dispatchEvent(new Event('focus'));
  assert.equal(game.playing, true);
  assert.equal(game.paused, false);
  assert.equal(activity.resets, 1);
  assert.equal(activity.updates, 1);
  document.dispatchEvent(new KeyEvent('keydown', 32));
  document.dispatchEvent(new KeyEvent('keyup', 32));
  assert.equal(activity.jumps, 1);
  assert.equal(activity.releases, 1);

  const finalActivity = { ...activity };
  const finalPose = game.tRex.yPos;
  const finalDistance = game.distanceRan;
  game.terminate();
  const cancellations = run.cancelledFrames.length;
  game.terminate();
  assert.equal(run.cancelledFrames.length, cancellations);
  assert.equal(run.cancelledFrames.at(-1), 43);
  assert.equal(game.outerContainerEl.inert, true);

  let controlEvents = 0;
  document.addEventListener('keyup', () => controlEvents++);
  document.addEventListener('pointerup', () => controlEvents++);
  lateEvents(run);
  assert.equal(controlEvents, 5);
  assert.equal(game.playing, false);
  assert.equal(game.paused, true);
  assert.equal(game.crashed, false);
  assert.equal(game.distanceRan, finalDistance);
  assert.equal(game.tRex.yPos, finalPose);
  assert.deepEqual(activity, finalActivity);
});

for (const options of [{ intro: true }, { crashed: true }]) {
  test(`termination prevents resume and restart after ${options.intro ? 'an early intro stop' : 'a collision'}`, () => {
    const run = fixture(options);
    const { game } = run;
    game.terminate();
    assert.deepEqual(run.cancelledFrames, [42]);
    if (options.intro) game.startGame(); // A late bound animation-end callback.
    lateEvents(run);
    assert.equal(game.playing, false);
    assert.equal(game.distanceRan, 1200);
    assert.equal(game.tRex.yPos, 90);
    assert.deepEqual(run.activity, {
      resets: 0,
      jumps: 0,
      releases: 0,
      updates: 0,
    });
  });
}
