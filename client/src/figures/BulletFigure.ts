import { Vector2, BoundingBox } from "../game/types";
import { toCanvasY } from "../game/Terrain";
import { BoundingBoxFigure } from "./BoundingBoxFigure";

export class BulletFigure {
  static render({
    ctx,
    position,
    bounds,
    color,
    active = true
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2;
    bounds: BoundingBox;
    color: string;
    active?: boolean;
  }) {
    if (!active) return;

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

    // Draw debug bounding box using BoundingBoxFigure
    BoundingBoxFigure.render(ctx, bounds);
  }
} 