import { BoundingBox } from "@/game/types/BoundingBox";
import { toCanvasY } from "@/game/world/Terrain";
import { EntityTransform } from "@/game/types/EntityTransform";

const PELLET_RADIUS = 2;

export class BulletFigure {
  static render({
    ctx,
    transform,
    bounds,
    isPellet = false
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    bounds: BoundingBox;
    isPellet?: boolean;
  }) {
    const position = transform.position;
    const canvasY = toCanvasY(position.y);

    ctx.fillStyle = "black";

    if (isPellet) {
      ctx.beginPath();
      ctx.arc(position.x, canvasY, PELLET_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(
        position.x - bounds.width / 2,
        canvasY - bounds.height / 2,
        bounds.width,
        bounds.height
      );
    }
  }
} 