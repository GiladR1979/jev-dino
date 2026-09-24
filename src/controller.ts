import {
  createGame,
  getScore,
  Keyboard,
  type GameObstacle,
} from './game-adapter';
import {
  DecisionSession,
  type Obstacle,
  type Action,
} from './decision-session';
import { launchX } from './timing';
import { GameRecorder } from './recorder';
import { drawStage } from './presentation';

const element = (id: string) => document.getElementById(id)!;
const stage = element('stage') as HTMLCanvasElement;
const context = stage.getContext('2d')!;
const button = (id: string) => element(id) as HTMLButtonElement;
const keyboard = new Keyboard();
await Promise.all(
  Array.from(document.querySelectorAll('img')).map((image) => image.decode()),
);
const game = createGame();
let phase: 'ready' | 'starting' | 'running' | 'saving' | 'finished' = 'ready';
let session: DecisionSession | null = null;
let recorder: GameRecorder | null = null;
let fault = '';
let lastAction = 'READY';
let stoppedScore = 0;
let frameCount = 0;
let frameTime = 0;
let lastFrame = 0;
let timer: ReturnType<typeof setInterval> | undefined;
let initialJumpTimer: ReturnType<typeof setTimeout> | undefined;
let nextId = 1;
let lastDucked: number | null = null;
const ids = new WeakMap<GameObstacle, number>();
const plans = new Map<number, { action: Action; launch?: number }>();
const done = new Set<number>();
const actions: {
  ms: number;
  id: number;
  action: string;
  score: number;
  obstacle: Obstacle | null;
  launch?: number;
}[] = [];
function id(obstacle: GameObstacle): number {
  if (!ids.has(obstacle)) ids.set(obstacle, nextId++);
  return ids.get(obstacle)!;
}
function obstacles(): GameObstacle[] {
  return game.horizon.obstacles.filter(
    (o) => o.xPos + o.width > game.tRex.xPos - 2,
  );
}
function target(): GameObstacle | undefined {
  return obstacles().find(
    (o) => o.xPos < game.dimensions.width && !done.has(id(o)),
  );
}
function observation(o?: GameObstacle): Obstacle | null {
  return o
    ? {
        id: id(o),
        type: o.typeConfig.type,
        x: Math.round(o.xPos),
        y: o.yPos,
        width: o.width,
      }
    : null;
}
function status(): void {
  element('status').textContent =
    `${phase.toUpperCase()} · Score ${getScore(game)} · ${(session?.hz ?? 0).toFixed(2)} requests/s · ${session?.sent ?? 0} requests · ${session?.lastLatency ?? 0} ms JEV${fault ? '\n' + fault : ''}`;
}
async function requestDecision(): Promise<void> {
  if (phase !== 'running' || !session || game.crashed || game.paused) return;
  try {
    const receipt = await session.request({
      speed: game.currentSpeed,
      grounded: !game.tRex.jumping,
      obstacle: observation(target()),
    });
    if (!receipt || phase !== 'running') return;
    if (receipt.action === 'ask_user' || receipt.action === 'inspect_more') {
      fault = `JEV requested ${receipt.action}`;
      await finish('model-needs-attention');
      return;
    }
    const live = obstacles().find((o) => id(o) === receipt.obstacleId);
    if (live && !done.has(id(live)) && !plans.has(id(live)))
      plans.set(id(live), { action: receipt.action });
  } catch (error) {
    if (phase !== 'running') return;
    fault = error instanceof Error ? error.message : 'Decision failed';
    await finish('JEV error');
  }
}
function actuate(): void {
  if (phase !== 'running' || !game.playing || game.playingIntro || game.crashed)
    return;
  const visible = obstacles();
  const liveIds = new Set(visible.map(id));
  // Release obsolete plans so a long run does not accumulate obstacle state.
  for (const key of plans.keys()) if (!liveIds.has(key)) plans.delete(key);
  for (const key of done) if (!liveIds.has(key)) done.delete(key);
  if (lastDucked !== null && !liveIds.has(lastDucked)) {
    keyboard.set(40, false);
    lastDucked = null;
  }
  for (const obstacle of visible) {
    const obstacleId = id(obstacle);
    if (done.has(obstacleId)) continue;
    const plan = plans.get(obstacleId);
    if (!plan) continue;
    if (plan.action === 'run') {
      done.add(obstacleId);
      continue;
    }
    if (plan.action === 'duck') {
      if (
        obstacle.xPos >= game.tRex.xPos + game.currentSpeed * 22 ||
        game.tRex.jumping
      )
        break;
      keyboard.set(32, false);
      keyboard.set(40, true);
      lastDucked = obstacleId;
    } else if (plan.action === 'jump') {
      plan.launch ??= launchX(game, obstacle);
      if (obstacle.xPos > plan.launch || game.tRex.jumping) break;
      keyboard.set(40, false);
      lastDucked = null;
      keyboard.set(32, false);
      keyboard.set(32, true);
    } else break;
    done.add(obstacleId);
    lastAction = plan.action.toUpperCase();
    actions.push({
      ms: Math.round(performance.now() - session!.started),
      id: obstacleId,
      action: plan.action,
      obstacle: observation(obstacle),
      launch: plan.launch,
      score: getScore(game),
    });
    break;
  }
  if (!game.tRex.jumping) keyboard.set(32, false);
}
function download(blob: Blob, name: string, label: string): void {
  const anchor = document.createElement('a');
  // Keep the object URL alive until page unload so failed uploads remain recoverable.
  anchor.href = URL.createObjectURL(blob);
  anchor.download = name;
  anchor.textContent = label;
  element('downloads').appendChild(anchor);
}
async function post(url: string, body: BodyInit, json = false): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    body,
    headers: json ? { 'Content-Type': 'application/json' } : {},
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok)
    throw new Error(
      `Could not save ${url.split('?')[0]} (HTTP ${response.status})`,
    );
}
async function finish(reason: string): Promise<void> {
  if (phase !== 'running') return;
  phase = 'saving';
  clearInterval(timer);
  clearTimeout(initialJumpTimer);
  session!.close();
  game.terminate();
  keyboard.release();
  stoppedScore = getScore(game);
  button('stop').disabled = true;
  status();
  let file: string | null = null;
  try {
    if (recorder) {
      await new Promise((resolve) => setTimeout(resolve, 1800));
      const blob = await recorder.stop();
      file = `${session!.id}-score-${stoppedScore}.webm`;
      download(
        blob,
        file,
        `Download video · ${stoppedScore.toLocaleString()} points`,
      );
      await post(
        '/recording?name=' + encodeURIComponent(file.slice(0, -5)),
        blob,
      );
    }
  } catch (error) {
    fault = error instanceof Error ? error.message : 'Recording failed';
  } finally {
    recorder = null;
    const report = {
      runId: session!.id,
      score: stoppedScore,
      reason,
      file,
      fault,
      upstreamVersion: '153.0.8010.53',
      gameplayModified: false,
      decisionMethod:
        'Structured obstacle observations to JEV; original physics simulation schedules selected key actions',
      sent: session!.sent,
      received: session!.received,
      actions,
      decisions: session!.decisions,
      dispatchTimesMs: session!.dispatchTimes.map((time) =>
        Math.round(time - session!.started),
      ),
      fps: frameTime ? (1000 * frameCount) / frameTime : 0,
    };
    const body = JSON.stringify(report, null, 2);
    download(
      new Blob([body], { type: 'application/json' }),
      session!.id + '.json',
      'Download run evidence',
    );
    try {
      await post('/evidence', body, true);
    } catch {
      fault += `${fault ? '\n' : ''}Evidence upload failed; use the download link.`;
    }
    phase = 'finished';
    element('new-run').hidden = false;
    status();
  }
}
async function start(record: boolean): Promise<void> {
  if (phase !== 'ready') return;
  phase = 'starting';
  button('practice').disabled = button('record').disabled = true;
  try {
    // Arm capture before starting the original game.
    if (record) {
      recorder = new GameRecorder();
      await recorder.start(stage, game.audioContext);
    }
    session = new DecisionSession();
    phase = 'running';
    lastAction = 'START';
    button('stop').disabled = false;
    keyboard.set(32, true);
    initialJumpTimer = setTimeout(() => keyboard.set(32, false), 350);
    timer = setInterval(() => {
      void requestDecision();
      status();
    }, 100);
    status();
  } catch (error) {
    fault =
      error instanceof Error ? error.message : 'Could not start recording';
    recorder = null;
    phase = 'ready';
    button('practice').disabled = button('record').disabled = false;
    status();
  }
}
function loop(time: number): void {
  if (lastFrame && phase === 'running') {
    frameCount++;
    frameTime += time - lastFrame;
  }
  lastFrame = time;
  actuate();
  drawStage(context, game, {
    enabled: phase === 'running',
    recording: Boolean(recorder),
    ending: phase === 'saving',
    fault,
    score: getScore(game),
    hz: session?.hz ?? 0,
    lastLatency: session?.lastLatency ?? 0,
    lastAction,
    stoppedScore,
  });
  if (phase === 'running' && (game.crashed || recorder?.error)) {
    fault = game.crashed
      ? `Collision at score ${getScore(game)}`
      : 'Browser recording failed';
    void finish(game.crashed ? 'collision' : 'recording error');
  }
  requestAnimationFrame(loop);
}
button('practice').addEventListener('click', () => void start(false));
button('record').addEventListener('click', () => void start(true));
button('stop').addEventListener('click', () => void finish('stopped'));
window.addEventListener('pagehide', () => {
  clearInterval(timer);
  clearTimeout(initialJumpTimer);
  session?.close();
  keyboard.release();
});
requestAnimationFrame(loop);
try {
  const health = await (await fetch('/health')).json();
  if (!health.configured) {
    button('practice').disabled = button('record').disabled = true;
    element('status').textContent =
      'Add your JEV key to .env, restart the server, and reload to enable AI play. See README.md.';
  } else status();
} catch {
  element('status').textContent =
    'Cannot reach the local server. Restart npm start and reload.';
}
