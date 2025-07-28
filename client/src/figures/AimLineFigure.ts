import { toCanvasY } from "../game/Terrain";
import { EntityTransform } from "../game/EntityTransform";

export class AimLineFigure {
  static render({
    ctx,
    transform,
    aimLineLength
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    aimLineLength: number;
  }) {
    const position = transform.position;
    const aimEndX = position.x + Math.cos(transform.rotation) * aimLineLength * transform.facing;
    const aimEndY = position.y + Math.sin(transform.rotation) * aimLineLength;
    ctx.save();
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(position.x, toCanvasY(position.y));
    ctx.lineTo(aimEndX, toCanvasY(aimEndY));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
} 