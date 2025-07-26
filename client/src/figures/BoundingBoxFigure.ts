import { AbsoluteBoundingBox } from "../game/BoundingBox";
import { toCanvasY } from "../game/Terrain";

export class BoundingBoxFigure {
  static render(ctx: CanvasRenderingContext2D, absBounds: AbsoluteBoundingBox) {
    const debugMode = typeof window !== 'undefined' && window.__DEBUG_MODE__ !== undefined ? window.__DEBUG_MODE__ : false;
    if (debugMode) {
      ctx.save();
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 1;
      const width = absBounds.lowerRight.x - absBounds.upperLeft.x;
      const height = absBounds.upperLeft.y - absBounds.lowerRight.y;
      ctx.strokeRect(
        absBounds.upperLeft.x,
        toCanvasY(absBounds.upperLeft.y),
        width,
        height
      );
      ctx.restore();
    }
  }
}
