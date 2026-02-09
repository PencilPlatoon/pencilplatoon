import { toCanvasY } from "@/game/world/Terrain";
import { EntityTransform } from "@/game/types/EntityTransform";

export class StraightAimLineFigure {
  static render({
    ctx,
    transform,
    length,
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    length: number;
  }) {
    const position = transform.position;
    const aimEndX = position.x + Math.cos(transform.rotation) * length * transform.facing;
    const aimEndY = position.y + Math.sin(transform.rotation) * length;

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
