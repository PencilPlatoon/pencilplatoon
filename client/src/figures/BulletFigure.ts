import { BoundingBox } from "../game/BoundingBox";
import { toCanvasY } from "../game/Terrain";
import { EntityTransform } from "../game/EntityTransform";

export class BulletFigure {
  static render({
    ctx,
    transform,
    bounds,
    color,
    active = true
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    bounds: BoundingBox;
    color: string;
    active?: boolean;
  }) {
    if (!active) return;
    const position = transform.position;

    const canvasY = toCanvasY(position.y) - bounds.height / 2;

    ctx.fillStyle = color;
    ctx.fillRect(
      position.x - bounds.width / 2,
      canvasY,
      bounds.width,
      bounds.height
    );

    // Add glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.fillRect(
      position.x - bounds.width / 2,
      canvasY,
      bounds.width,
      bounds.height
    );
    ctx.shadowBlur = 0;
  }
} 