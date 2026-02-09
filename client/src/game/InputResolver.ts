export interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  triggerPressed: boolean;
  aimUp: boolean;
  aimDown: boolean;
}

export const EMPTY_INPUT: PlayerInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  triggerPressed: false,
  aimUp: false,
  aimDown: false,
};

export const resolveInput = (keys: Set<string>, mobileInput: PlayerInput): PlayerInput => ({
  left: keys.has("KeyA") || keys.has("ArrowLeft") || mobileInput.left,
  right: keys.has("KeyD") || keys.has("ArrowRight") || mobileInput.right,
  up: keys.has("KeyW") || keys.has("ArrowUp") || mobileInput.up,
  down: keys.has("KeyS") || keys.has("ArrowDown") || mobileInput.down,
  jump: keys.has("Space") || mobileInput.jump,
  triggerPressed: keys.has("KeyJ") || mobileInput.triggerPressed,
  aimUp: keys.has("KeyI") || mobileInput.aimUp,
  aimDown: keys.has("KeyK") || mobileInput.aimDown,
});
