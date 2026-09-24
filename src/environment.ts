// Host-only adapters; no game rules are changed.
export function assert(
  value: unknown,
  message = 'Chromium assertion failed',
): asserts value {
  if (!value) throw new Error(message);
}
const strings: Record<string, string> = {
  dinoGameA11yAriaLabel: 'Dinosaur game',
  dinoGameA11yDescription: 'Press space to jump and down to duck.',
  dinoGameA11yGameOver: 'Game over',
  dinoGameA11yHighScore: 'High score $1',
  dinoGameA11yJump: 'Jump',
  dinoGameA11yStartGame: 'Game started',
  dinoGameA11ySpeedToggle: 'Slower speed',
};
export const loadTimeData = {
  valueExists: (key: string) => Object.hasOwn(strings, key),
  getString: (key: string) => strings[key] || '',
  getValue: (key: string) => strings[key],
};
