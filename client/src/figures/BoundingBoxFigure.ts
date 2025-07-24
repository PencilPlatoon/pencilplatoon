import { BoundingBox } from "../game/types";
import { toCanvasY } from "../game/Terrain";

export class BoundingBoxFigure {
  static render(ctx: CanvasRenderingContext2D, bounds: BoundingBox) {
    const debugMode = typeof window !== 'undefined' && window.__DEBUG_MODE__ !== undefined ? window.__DEBUG_MODE__ : false;
    if (debugMode) {
      ctx.save();
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        bounds.x,
        toCanvasY(bounds.y + bounds.height),
        bounds.width,
        toCanvasY(bounds.y) - toCanvasY(bounds.y + bounds.height)
      );
      ctx.restore();
    }
  }
} 