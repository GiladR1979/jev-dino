import type { Game, GameObstacle, Player } from './game-adapter';

/** Forecast a launch window on disposable clones, never on the live player. */
export function launchX(game: Game, obstacle: GameObstacle): number {
  const { tRex: player, currentSpeed: speed } = game;
  const delta = 1000 / 60;
  const valid: number[] = [];
  for (let x = Math.round(player.xPos + 36); x < player.xPos + 340; x += 3) {
    const sim: Player = Object.assign(
      Object.create(Object.getPrototypeOf(player)),
      player,
    );
    sim.draw = () => {};
    sim.reset();
    sim.startJump(speed);
    const forecast = { ...obstacle, xPos: x };
    let collision = false;
    let passed = false;
    for (let frame = 0; frame < 65; frame++) {
      if (sim.jumping) sim.updateJump(delta);
      forecast.xPos -= Math.floor(
        ((speed + (obstacle.speedOffset || 0)) * delta * 60) / 1000,
      );
      if (game.checkForCollision(forecast, sim)) {
        collision = true;
        break;
      }
      if (forecast.xPos + forecast.width < player.xPos - 3) {
        passed = true;
        break;
      }
    }
    if (!collision && passed) valid.push(x);
  }
  return valid.length
    ? valid[Math.floor(valid.length * 0.48)]
    : player.xPos + speed * 60 * 0.24;
}
