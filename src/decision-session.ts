import type { ObstacleType } from './game-adapter';
export type Action = 'jump' | 'duck' | 'run' | 'inspect_more' | 'ask_user';
export interface Obstacle {
  id: number;
  type: ObstacleType;
  x: number;
  y: number;
  width: number;
}
export interface Observation {
  speed: number;
  grounded: boolean;
  obstacle: Obstacle | null;
}
export interface Receipt {
  runId: string;
  sequence: number;
  obstacleId: number | null;
  action: Action;
  model: string;
  latencyMs: number;
  usage: { input_tokens: number; output_tokens: number } | null;
}
export interface Decision extends Receipt {
  obstacle: Obstacle | null;
  elapsedMs: number;
}

/** Owns in-flight work. Closing a run makes every late response inert. */
export class DecisionSession {
  readonly id = `run-${Date.now()}`;
  readonly started = performance.now();
  readonly dispatchTimes: number[] = [];
  readonly decisions: Decision[] = [];
  readonly abort = new AbortController();
  sent = 0;
  received = 0;
  pending = 0;
  lastLatency = 0;
  private closed = false;
  constructor(private transport: typeof fetch = fetch) {}
  get hz(): number {
    const recent = this.dispatchTimes.filter(
      (t) => performance.now() - t < 10_000,
    );
    return recent.length > 1
      ? (1000 * (recent.length - 1)) / (recent.at(-1)! - recent[0])
      : 0;
  }
  close(): void {
    this.closed = true;
    this.abort.abort();
  }
  async request(state: Observation): Promise<Receipt | null> {
    if (this.closed || this.pending >= 10) return null;
    const sequence = ++this.sent;
    const time = performance.now();
    this.dispatchTimes.push(time);
    this.pending++;
    try {
      const response = await this.transport('/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...state, runId: this.id, sequence }),
        signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(6500)]),
      });
      if (this.closed) return null;
      if (!response.ok)
        throw new Error(`JEV request failed (HTTP ${response.status})`);
      const r = (await response.json()) as Receipt;
      if (this.closed) return null;
      if (
        r.runId !== this.id ||
        r.sequence !== sequence ||
        r.obstacleId !== (state.obstacle?.id ?? null) ||
        !['jump', 'duck', 'run', 'inspect_more', 'ask_user'].includes(
          r.action,
        ) ||
        !Number.isFinite(r.latencyMs) ||
        r.latencyMs < 0
      )
        throw new Error('Invalid decision receipt');
      this.received++;
      this.lastLatency = r.latencyMs;
      this.decisions.push({
        ...r,
        obstacle: state.obstacle,
        elapsedMs: Math.round(time - this.started),
      });
      return r;
    } catch (error) {
      if (this.closed) return null;
      throw error;
    } finally {
      this.pending--;
    }
  }
}
