import { MoveableControl } from '../MoveableControl';
import { Vector2 } from '../../game/Vector2';

export class HandControlFigure {
  static readonly BOX_SIZE = 5;
  static readonly LINE_WIDTH = 0.5;

  static render({
    ctx,
    position,
    control,
    isHovered
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2;
    control: MoveableControl;
    isHovered: boolean;
  }) {
    ctx.save();
    
    const boxSize = HandControlFigure.BOX_SIZE;
    ctx.lineWidth = HandControlFigure.LINE_WIDTH;
    ctx.strokeStyle = isHovered ? '#00dd00' : '#00ff00';
    ctx.strokeRect(position.x - boxSize/2, position.y - boxSize/2, boxSize, boxSize);
    
    ctx.restore();
  }

  static isMouseWithin(mousePos: Vector2, position: Vector2): boolean {
    const dx = mousePos.x - position.x;
    const dy = mousePos.y - position.y;

    return Math.abs(dx) < HandControlFigure.BOX_SIZE && Math.abs(dy) < HandControlFigure.BOX_SIZE;
  }
}
