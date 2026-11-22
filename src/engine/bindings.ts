export type Action =
  | 'forward'
  | 'back'
  | 'strafeLeft'
  | 'strafeRight'
  | 'turnLeft'
  | 'turnRight'
  | 'run'
  | 'use'
  | 'fire'
  | 'cycle'
  | 'map'
  | 'log';

export const ACTION_LABELS: Record<Action, string> = {
  forward: 'MOVE FORWARD',
  back: 'MOVE BACK',
  strafeLeft: 'STRAFE LEFT',
  strafeRight: 'STRAFE RIGHT',
  turnLeft: 'TURN LEFT',
  turnRight: 'TURN RIGHT',
  run: 'RUN',
  use: 'USE / INTERACT',
  fire: 'USE TOOL (KEY)',
  cycle: 'NEXT TOOL',
  map: 'MAP',
  log: 'EVIDENCE LOG',
};

export const DEFAULT_BINDINGS: Record<Action, string[]> = {
  forward: ['KeyW'],
  back: ['KeyS'],
  strafeLeft: ['KeyA'],
  strafeRight: ['KeyD'],
  turnLeft: ['ArrowLeft'],
  turnRight: ['ArrowRight'],
  run: ['ShiftLeft', 'ShiftRight'],
  use: ['KeyE', 'Space'],
  fire: ['KeyF'],
  cycle: ['KeyQ'],
  map: ['KeyM'],
  log: ['KeyL'],
};

const ACTIONS = Object.keys(ACTION_LABELS) as Action[];

export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (code === 'ArrowLeft') return 'LEFT';
  if (code === 'ArrowRight') return 'RIGHT';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'Space') return 'SPACE';
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return code;
}

export function rebind(
  bindings: Record<Action, string[]>,
  action: Action,
  code: string,
): Record<Action, string[]> {
  return Object.fromEntries(
    ACTIONS.map((key) => [
      key,
      key === action ? [code] : bindings[key].filter((bound) => bound !== code),
    ]),
  ) as Record<Action, string[]>;
}

export function resolveBindings(partial: unknown): Record<Action, string[]> {
  const resolved = Object.fromEntries(
    ACTIONS.map((action) => [action, [...DEFAULT_BINDINGS[action]]]),
  ) as Record<Action, string[]>;
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return resolved;

  const values = partial as Record<string, unknown>;
  for (const action of ACTIONS) {
    const saved = values[action];
    if (!Array.isArray(saved)) continue;
    resolved[action] = saved.filter(
      (code): code is string => typeof code === 'string' && code.length > 0,
    );
  }
  return resolved;
}
