import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

const bundled = await build({
  entryPoints: [fileURLToPath(new URL('../src/recorder.ts', import.meta.url))],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'recording',
});
function fixture({ failEncoder = false } = {}) {
  const resources = {
    contexts: [],
    sources: [],
    tracks: [],
    startedWithAudio: false,
  };
  function track() {
    const value = {
      stopped: false,
      stop() {
        this.stopped = true;
      },
    };
    resources.tracks.push(value);
    return value;
  }
  class Stream {
    tracks = [track()];
    getAudioTracks() {
      return this.tracks;
    }
    getTracks() {
      return this.tracks;
    }
    addTrack(value) {
      this.tracks.push(value);
    }
  }
  class AudioContext {
    active = false;
    closed = false;
    constructor() {
      resources.contexts.push(this);
    }
    createBufferSource() {
      return { connect() {} };
    }
    createMediaStreamDestination() {
      return { stream: new Stream() };
    }
    createMediaStreamSource() {
      return { connect() {} };
    }
    createConstantSource() {
      const context = this;
      const source = {
        offset: { value: 1 },
        connected: false,
        stopped: false,
        connect() {
          this.connected = true;
        },
        disconnect() {
          this.connected = false;
        },
        start() {
          context.active = this.connected && this.offset.value === 0;
        },
        stop() {
          this.stopped = true;
          context.active = false;
        },
      };
      resources.sources.push(source);
      return source;
    }
    async resume() {}
    async close() {
      this.closed = true;
    }
  }
  class MediaRecorder {
    state = 'inactive';
    static isTypeSupported() {
      return true;
    }
    constructor() {
      if (failEncoder) throw new Error('Encoder setup failed');
    }
    start() {
      // The encoder needs an active audio producer even before any game sound.
      resources.startedWithAudio = resources.contexts[0].active;
      this.state = 'recording';
      this.ondataavailable({ data: new Blob(['captured-frame']) });
    }
    stop() {
      this.state = 'inactive';
      queueMicrotask(() => this.onstop());
    }
  }
  const context = {
    AudioContext,
    MediaRecorder,
    Blob,
    requestAnimationFrame: (callback) => queueMicrotask(callback),
  };
  runInNewContext(bundled.outputFiles[0].text, context);
  return {
    recorder: new context.recording.GameRecorder(),
    canvas: { captureStream: () => new Stream() },
    resources,
  };
}
test('capture has an active silent audio producer before any game sound and releases all resources', async () => {
  const { recorder, canvas, resources } = fixture();
  await recorder.start(canvas, null);
  assert.equal(resources.startedWithAudio, true);
  const firstStop = recorder.stop();
  assert.equal(recorder.stop(), firstStop);
  const video = await firstStop;
  assert.equal(await video.text(), 'captured-frame');
  assert.ok(resources.tracks.every((track) => track.stopped));
  assert.ok(
    resources.sources.every((source) => source.stopped && !source.connected),
  );
  assert.ok(resources.contexts.every((context) => context.closed));
});
test('encoder setup failure also disposes the audio producer and captured tracks', async () => {
  const { recorder, canvas, resources } = fixture({ failEncoder: true });
  await assert.rejects(recorder.start(canvas, null), /Encoder setup failed/);
  assert.ok(resources.tracks.every((track) => track.stopped));
  assert.ok(
    resources.sources.every((source) => source.stopped && !source.connected),
  );
  assert.ok(resources.contexts.every((context) => context.closed));
});
