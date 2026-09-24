import { Runner } from '@chromium/offline';

export type ObstacleType = 'cactusSmall' | 'cactusLarge' | 'pterodactyl';
export interface GameObstacle {
  xPos: number;
  yPos: number;
  width: number;
  speedOffset?: number;
  typeConfig: { type: ObstacleType };
}
export interface Player {
  xPos: number;
  yPos: number;
  jumping: boolean;
  ducking: boolean;
  draw(...args: unknown[]): void;
  reset(): void;
  startJump(speed: number): void;
  updateJump(delta: number): void;
}
/** The one boundary that depends on Chromium's private implementation details. */
export interface Game {
  tRex: Player;
  horizon: { obstacles: GameObstacle[] };
  dimensions: { width: number };
  currentSpeed: number;
  distanceRan: number;
  distanceMeter: { getActualDistance(distance: number): number };
  canvas: HTMLCanvasElement;
  audioContext: AudioContext | null;
  playing: boolean;
  playingIntro: boolean;
  paused: boolean;
  crashed: boolean;
  inverted: boolean;
  checkForCollision(obstacle: GameObstacle, player: Player): unknown;
  terminate(): void;
}
interface RunnerLifecycle {
  outerContainerEl: HTMLElement;
  stop(): void;
  onVisibilityChange(event: Event): void;
  handleEvent(event: Event): void;
  onKeyDown(event: Event): void;
  onKeyUp(event: Event): void;
}
export function createGame(): Game {
  const game = Runner.initializeInstance('#game') as Game & RunnerLifecycle;
  let terminated = false;
  // Install before startGame binds visibility callbacks. Gating play() alone
  // would still let a late focus callback reset the final dinosaur pose.
  for (const method of [
    'onVisibilityChange',
    'handleEvent',
    'onKeyDown',
    'onKeyUp',
  ] as const) {
    const original = game[method];
    game[method] = (event) => {
      if (!terminated) original.call(game, event);
    };
  }
  game.terminate = () => {
    if (terminated) return;
    terminated = true;
    // Use Chromium's own cancellation, including before its intro has ended.
    game.stop();
    // Bound canvas accessibility handlers cannot receive further user input.
    // Page controls and downloads live outside this hidden game subtree.
    game.outerContainerEl.inert = true;
  };
  return game;
}
export function getScore(game: Game): number {
  return game.distanceMeter.getActualDistance(Math.ceil(game.distanceRan));
}
export class Keyboard {
  private held = new Set<number>();
  set(code: 32 | 40, down: boolean): void {
    if (down === this.held.has(code)) return;
    if (down) this.held.add(code);
    else this.held.delete(code);
    document.dispatchEvent(
      new KeyboardEvent(down ? 'keydown' : 'keyup', {
        bubbles: true,
        cancelable: true,
        keyCode: code,
        which: code,
        key: code === 32 ? ' ' : 'ArrowDown',
        code: code === 32 ? 'Space' : 'ArrowDown',
      }),
    );
  }
  release(): void {
    this.set(32, false);
    this.set(40, false);
  }
}
