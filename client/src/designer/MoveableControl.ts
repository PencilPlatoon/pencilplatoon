import { Vector2 } from '../game/types/Vector2';

export type ControlId = 'primary' | 'secondary' | 'weapon';

export interface MoveableControl {
  id: ControlId;
  getAbsPosition: () => Vector2 | null;
  updateAbsPosition: (controlAbsPosition: Vector2) => void;
  color: string;
  hoverColor: string;
  render: (params: { ctx: CanvasRenderingContext2D; position: Vector2; isHovered: boolean }) => void;
  isMouseWithin: (mousePos: Vector2) => boolean;
}
