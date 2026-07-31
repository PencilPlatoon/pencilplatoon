import { toCanvasY } from "@/game/world/Terrain";
import { EntityTransform } from "@/game/types/EntityTransform";
import { Vector2Utils } from "@/game/types/Vector2";

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
    const aimOffset = Vector2Utils.fromAngle(transform.rotation, length, transform.facing);
    const aimEndX = position.x + aimOffset.x;
    const aimEndY = position.y + aimOffset.y;

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
