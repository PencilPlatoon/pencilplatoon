import { toCanvasY } from "../game/Terrain";
import { EntityTransform } from "../game/EntityTransform";

export class ShootingAimLineFigure {
  static readonly AIM_LINE_LENGTH = 100;

  static render({
    ctx,
    transform,
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
  }) {
    const position = transform.position;
    const aimEndX = position.x + Math.cos(transform.rotation) * this.AIM_LINE_LENGTH * transform.facing;
    const aimEndY = position.y + Math.sin(transform.rotation) * this.AIM_LINE_LENGTH;
    
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

