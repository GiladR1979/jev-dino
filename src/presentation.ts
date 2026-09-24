import type { Game } from './game-adapter';
export interface DisplayState {
  enabled: boolean;
  recording: boolean;
  ending: boolean;
  fault: string;
  score: number;
  hz: number;
  lastLatency: number;
  lastAction: string;
  stoppedScore: number;
}
export function drawStage(
  ctx: CanvasRenderingContext2D,
  game: Game,
  state: DisplayState,
): void {
  const dark = game.inverted;
  const ink = dark ? '#e5ecdf' : '#183b29';
  const muted = dark ? '#a3b5a7' : '#738174';
  const text = (
    label: string,
    x: number,
    y: number,
    size = 24,
    color = muted,
    weight = 400,
  ) => {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px system-ui,-apple-system,sans-serif`;
    ctx.fillText(label, x, y);
  };
  ctx.fillStyle = dark ? '#18221e' : '#f6f8f2';
  ctx.fillRect(0, 0, 1920, 1080);
  text('JEV × DINO', 100, 132, 68, ink, 750);
  text('An AI takes on the original Chromium dinosaur game', 104, 184, 27);
  text(
    state.recording ? '● LIVE CAPTURE' : state.enabled ? '● LIVE' : 'READY',
    1530,
    120,
    22,
    state.recording ? '#c96e53' : '#5a8565',
    650,
  );
  ctx.fillStyle = dark ? '#24312b' : '#fff';
  ctx.beginPath();
  ctx.roundRect(90, 245, 1740, 525, 22);
  ctx.fill();
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (dark) ctx.filter = 'invert(1)';
  ctx.drawImage(game.canvas, 160, 305, 1600, 400);
  ctx.restore();
  text(String(state.score).padStart(5, '0'), 100, 889, 72, ink, 650);
  text('SCORE', 105, 936, 20, muted, 600);
  text(state.hz.toFixed(1), 570, 887, 62, ink, 650);
  text('JEV REQUESTS / SECOND', 572, 936, 20, muted, 600);
  text(`${state.lastLatency} ms`, 1120, 886, 54, ink, 650);
  text('LATEST RESPONSE', 1124, 936, 20, muted, 600);
  text(state.lastAction, 1580, 885, 40, ink, 650);
  text('LAST ACTION', 1580, 936, 20, muted, 600);
  text(
    'CHROMIUM 153 · ORIGINAL RULES · NORMAL SPEED',
    104,
    1020,
    19,
    muted,
    500,
  );
  text('JEV action selection + local timing', 1370, 1020, 19, muted, 500);
  if (state.ending || (!state.enabled && state.stoppedScore)) {
    text(
      state.fault
        ? 'RUN ENDED'
        : `RUN COMPLETE · ${state.stoppedScore.toLocaleString()} POINTS`,
      104,
      222,
      23,
      state.fault ? '#b36347' : ink,
      600,
    );
  }
}
