import { MoveableControl } from '../MoveableControl';
import { Vector2 } from '../../game/Vector2';

export class WeaponPositionControlFigure {
  static readonly BOX_SIZE = 5;
  static readonly LINE_WIDTH = 1;

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
    
    const boxSize = WeaponPositionControlFigure.BOX_SIZE;
    const arrowLength = boxSize * 0.8; // Smaller arrows relative to box size
    const arrowWidth = boxSize * 0.3;
    
    ctx.strokeStyle = isHovered ? '#dd0000' : '#ff0000';
    ctx.lineWidth = WeaponPositionControlFigure.LINE_WIDTH;
    
    // Draw center circle (same size as hand control)
    ctx.beginPath();
    ctx.arc(position.x, position.y, boxSize*0.25, 0, 2 * Math.PI);
    ctx.stroke();
    
    // Draw arrows (up, down, left, right)
    const arrows = [
      { dx: 0, dy: -arrowLength, points: [[0, 0], [-arrowWidth, arrowWidth], [arrowWidth, arrowWidth]] }, // up
      { dx: 0, dy: arrowLength, points: [[0, 0], [-arrowWidth, -arrowWidth], [arrowWidth, -arrowWidth]] }, // down
      { dx: -arrowLength, dy: 0, points: [[0, 0], [arrowWidth, -arrowWidth], [arrowWidth, arrowWidth]] }, // left
      { dx: arrowLength, dy: 0, points: [[0, 0], [-arrowWidth, -arrowWidth], [-arrowWidth, arrowWidth]] } // right
    ];
    
    for (const arrow of arrows) {
      ctx.beginPath();
      ctx.moveTo(position.x + arrow.dx, position.y + arrow.dy);
      for (const point of arrow.points) {
        ctx.lineTo(position.x + arrow.dx + point[0], position.y + arrow.dy + point[1]);
      }
      ctx.closePath();
      ctx.stroke();
    }
    
    ctx.restore();
  }

  static isMouseWithin(mousePos: Vector2, position: Vector2): boolean {
    const dx = mousePos.x - position.x;
    const dy = mousePos.y - position.y;

    return Math.abs(dx) < WeaponPositionControlFigure.BOX_SIZE && Math.abs(dy) < WeaponPositionControlFigure.BOX_SIZE;
  }
}
