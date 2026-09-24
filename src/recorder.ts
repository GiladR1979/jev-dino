/** Capture only the presentation canvas and the game's audio: no desktop or mic. */
const taps = new WeakMap<AudioContext, MediaStreamAudioDestinationNode>();
let current: GameRecorder | null = null;
const createSource = AudioContext.prototype.createBufferSource;
AudioContext.prototype.createBufferSource = function () {
  const source = createSource.call(this);
  if (current) current.bridge(this, source);
  return source;
};

export class GameRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mix: AudioContext | null = null;
  private audio: MediaStreamAudioDestinationNode | null = null;
  private bridged = new Set<AudioContext>();
  private stream: MediaStream | null = null;
  private recordingError: Error | null = null;
  private stopping: Promise<Blob> | null = null;
  bridge(context: AudioContext, source?: AudioBufferSourceNode): void {
    if (!this.mix || !this.audio) return;
    let tap = taps.get(context);
    if (!tap) {
      tap = context.createMediaStreamDestination();
      taps.set(context, tap);
    }
    source?.connect(tap);
    if (!this.bridged.has(context)) {
      this.mix.createMediaStreamSource(tap.stream).connect(this.audio);
      this.bridged.add(context);
    }
  }
  async start(
    canvas: HTMLCanvasElement,
    gameAudio: AudioContext | null,
  ): Promise<void> {
    const mimeType = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType)
      throw new Error('This browser cannot record WebM with game audio');
    try {
      this.mix = new AudioContext();
      this.audio = this.mix.createMediaStreamDestination();
      await this.mix.resume();
      current = this;
      if (gameAudio) this.bridge(gameAudio);
      this.stream = canvas.captureStream(60);
      for (const track of this.audio.stream.getAudioTracks())
        this.stream.addTrack(track);
      this.recorder = new MediaRecorder(this.stream, {
        mimeType,
        videoBitsPerSecond: 8_000_000,
      });
      this.recorder.ondataavailable = (event) => {
        if (event.data.size) this.chunks.push(event.data);
      };
      this.recorder.onerror = () => {
        this.recordingError = new Error('Browser recording failed');
      };
      this.recorder.start(1000);
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    } catch (error) {
      await this.dispose();
      throw error;
    }
  }
  get error(): Error | null {
    return this.recordingError;
  }
  stop(): Promise<Blob> {
    if (this.stopping) return this.stopping;
    this.stopping = this.finalize();
    return this.stopping;
  }
  private async finalize(): Promise<Blob> {
    try {
      if (this.recorder?.state !== 'inactive' && this.recorder) {
        await new Promise<void>((resolve) => {
          this.recorder!.onstop = () => resolve();
          this.recorder!.stop();
        });
      }
      if (this.recordingError) throw this.recordingError;
      return new Blob(this.chunks, { type: 'video/webm' });
    } finally {
      await this.dispose();
    }
  }
  private async dispose(): Promise<void> {
    if (current === this) current = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    await this.mix?.close();
    this.mix = null;
    this.audio = null;
    this.chunks = [];
  }
}
