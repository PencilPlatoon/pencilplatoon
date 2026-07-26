import { TouchGlyph } from "@/rendering/TouchControlFigure";

export interface MobileInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  triggerPressed: boolean;
  aimUp: boolean;
  aimDown: boolean;
}

export const ACTION_TO_INPUT_KEY: Record<string, keyof MobileInput> = {
  left: 'left',
  right: 'right',
  jump: 'jump',
  shoot: 'triggerPressed',
  aimUp: 'aimUp',
  aimDown: 'aimDown',
};

export const EMPTY_INPUT: MobileInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  triggerPressed: false,
  aimUp: false,
  aimDown: false,
};

export interface TouchButton {
  /** Also the button's identity — one button per action. */
  action: string;
  glyph: TouchGlyph;
  cx: number;
  cy: number;
  /** Drawn size. */
  radius: number;
  /** Touchable size — slightly larger, so near-misses still register. */
  hitRadius: number;
  /** Fires once on press (weapon-swap, reload) rather than while held. */
  momentary: boolean;
}

/** Button sizes are tuned for this viewport dimension and scale from there. */
const REFERENCE_MIN_DIMENSION = 380;
const MIN_SCALE = 0.7;
const MAX_SCALE = 1.15;

const EDGE_MARGIN = 24;
const BUTTON_GAP = 16;
const MOVE_RADIUS = 34;
const JUMP_RADIUS = 30;
const SHOOT_RADIUS = 40;
const AIM_RADIUS = 26;
// Weapon-swap / reload are secondary, so they're drawn smaller than the
// primary movement and fire controls.
const SECONDARY_RADIUS = 24;

/** Secondary actions that fire once per tap instead of reporting a held state. */
export const MOMENTARY_ACTIONS: ReadonlySet<string> = new Set(['weapon', 'reload']);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/** Keeps the controls thumb-sized on small phones and short landscape windows. */
export const buttonScale = (width: number, height: number): number =>
  clamp(Math.min(width, height) / REFERENCE_MIN_DIMENSION, MIN_SCALE, MAX_SCALE);

/**
 * Lays the controls out in real viewport pixels: movement on the bottom left,
 * aiming and shooting stacked up the bottom right edge.
 */
export const createTouchButtons = (width: number, height: number): TouchButton[] => {
  const scale = buttonScale(width, height);
  const margin = EDGE_MARGIN * scale;
  const gap = BUTTON_GAP * scale;
  const move = MOVE_RADIUS * scale;
  const jump = JUMP_RADIUS * scale;
  const shoot = SHOOT_RADIUS * scale;
  const aim = AIM_RADIUS * scale;
  const secondary = SECONDARY_RADIUS * scale;

  const bottom = height - margin;
  const moveRowY = bottom - move;
  const leftX = margin + move;
  const rightX = leftX + move * 2 + gap;
  const jumpCx = (leftX + rightX) / 2;
  const jumpCy = moveRowY - move - gap - jump;

  // Shoot sits in the corner with the aim pair beside it, keeping the cluster
  // short enough to stay clear of the HUD buttons on landscape phones.
  const shootX = width - margin - shoot;
  const aimX = shootX - shoot - gap - aim;
  const aimDownY = bottom - aim;
  const aimUpY = aimDownY - aim * 2 - gap;
  // Fire is vertically centered on the aim pair — its midline matches the point
  // halfway between the up and down buttons — rather than bottom-aligned.
  const shootCy = (aimUpY + aimDownY) / 2;

  // Half the gap each, so neighbouring hit targets meet without overlapping.
  const slop = gap / 2;
  const button = (
    action: string,
    glyph: TouchGlyph,
    cx: number,
    cy: number,
    radius: number
  ): TouchButton => ({
    action,
    glyph,
    cx,
    cy,
    radius,
    hitRadius: radius + slop,
    momentary: MOMENTARY_ACTIONS.has(action),
  });

  // Weapon-swap and reload are weapon-management actions grouped with the aim/
  // fire controls on the right, laid out as a horizontal pair (weapon then
  // reload). Portrait sits the pair above the aim column; landscape places it
  // inboard along the bottom row, to the left of the aim column.
  const landscape = width > height;
  const pairHalfWidth = secondary + gap / 2;
  const secondaryRowCy = landscape ? bottom - secondary : aimUpY - aim - gap - secondary;
  const reloadCx = landscape ? aimX - aim - gap - secondary : aimX + pairHalfWidth;
  const weaponCx = landscape ? reloadCx - secondary - gap - secondary : aimX - pairHalfWidth;
  const weapon = button('weapon', 'weaponSwap', weaponCx, secondaryRowCy, secondary);
  const reload = button('reload', 'reload', reloadCx, secondaryRowCy, secondary);

  return [
    button('left', 'arrowLeft', leftX, moveRowY, move),
    button('right', 'arrowRight', rightX, moveRowY, move),
    button('jump', 'jump', jumpCx, jumpCy, jump),
    button('aimUp', 'chevronUp', aimX, aimUpY, aim),
    button('shoot', 'crosshair', shootX, shootCy, shoot),
    button('aimDown', 'chevronDown', aimX, aimDownY, aim),
    weapon,
    reload,
  ];
};

export const findButtonAt = (
  buttons: TouchButton[],
  x: number,
  y: number
): TouchButton | null => {
  for (const button of buttons) {
    const dx = x - button.cx;
    const dy = y - button.cy;
    if (dx * dx + dy * dy <= button.hitRadius * button.hitRadius) {
      return button;
    }
  }
  return null;
};

/** Derives the engine input from the actions currently held down. */
export const inputFromHeldActions = (heldActions: ReadonlySet<string>): MobileInput => {
  const input = { ...EMPTY_INPUT };
  heldActions.forEach((action) => {
    const key = ACTION_TO_INPUT_KEY[action];
    if (key) {
      input[key] = true;
    }
  });
  return input;
};
