export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const invalid = () => {
  throw new HttpError(400, 'Invalid observation');
};
function number(value, min, max, integer = false) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    invalid();
  return value;
}
export function validateObservation(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    !/^run-\d{10,20}$/.test(value.runId) ||
    typeof value.grounded !== 'boolean'
  )
    invalid();
  let obstacle = null;
  if (value.obstacle !== null) {
    const o = value.obstacle;
    if (!o || !['cactusSmall', 'cactusLarge', 'pterodactyl'].includes(o.type))
      invalid();
    obstacle = {
      id: number(o.id, 1, 1e9, true),
      type: o.type,
      x: number(o.x, -500, 10000),
      y: number(o.y, 0, 1000),
      width: number(o.width, 1, 1000),
    };
  }
  return {
    goal: 'Survive the next obstacle in Chromium Dino',
    runId: value.runId,
    sequence: number(value.sequence, 1, 1e9, true),
    speed: number(value.speed, 0, 30),
    grounded: value.grounded,
    obstacle,
  };
}
export function artifactName(value) {
  if (
    typeof value !== 'string' ||
    !/^run-\d{10,20}(?:-score-\d{1,12})?$/.test(value)
  )
    throw new HttpError(400, 'Invalid artifact name');
  return value;
}
