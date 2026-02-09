import { BoundingBox } from "../game/types/BoundingBox";
import { toCanvasY } from "../game/world/Terrain";
import { EntityTransform } from "../game/types/EntityTransform";

export class BulletFigure {
  static render({
    ctx,
    transform,
    bounds
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    bounds: BoundingBox;
  }) {
    const position = transform.position;

    const canvasY = toCanvasY(position.y) - bounds.height / 2;

    ctx.fillStyle = "black";
    ctx.fillRect(
      position.x - bounds.width / 2,
      canvasY,
      bounds.width,
      bounds.height
    );
  }
} 