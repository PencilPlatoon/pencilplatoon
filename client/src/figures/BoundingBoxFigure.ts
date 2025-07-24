import { BoundingBox, Vector2, AbsoluteBoundingBox } from "../game/types";
import { toCanvasY } from "../game/Terrain";

export class BoundingBoxFigure {
  static render(ctx: CanvasRenderingContext2D, absBounds: AbsoluteBoundingBox) {
    const debugMode = typeof window !== 'undefined' && window.__DEBUG_MODE__ !== undefined ? window.__DEBUG_MODE__ : false;
    if (debugMode) {
      ctx.save();
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        absBounds.upperLeft.x,
        toCanvasY(absBounds.upperLeft.y + (absBounds.lowerRight.y - absBounds.upperLeft.y)),
        absBounds.lowerRight.x - absBounds.upperLeft.x,
        toCanvasY(absBounds.upperLeft.y) - toCanvasY(absBounds.upperLeft.y + (absBounds.lowerRight.y - absBounds.upperLeft.y))
      );
      ctx.restore();
    }
  }
} 