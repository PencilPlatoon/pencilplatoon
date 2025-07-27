import { AbsoluteBoundingBox, BoundingBox } from "../game/BoundingBox";
import { Vector2 } from "../game/types";
import { toCanvasY } from "../game/Terrain";

export class BoundingBoxFigure {
  static render(ctx: CanvasRenderingContext2D, absBounds: AbsoluteBoundingBox) {
    const debugMode = typeof window !== 'undefined' && window.__DEBUG_MODE__ !== undefined ? window.__DEBUG_MODE__ : false;
    if (!debugMode) return;

    ctx.save();
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1;

    // Render axis-aligned bounding box
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

  static renderRotated({
    ctx,
    boundingBox,
    position,
    facing,
    rotation
  }: {
    ctx: CanvasRenderingContext2D;
    boundingBox: BoundingBox;
    position: Vector2;
    facing: number;
    rotation: number;
  }) {
    const debugMode = typeof window !== 'undefined' && window.__DEBUG_MODE__ !== undefined ? window.__DEBUG_MODE__ : false;
    if (!debugMode) return;

    ctx.save();
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1;

    // Apply the same transformations as WeaponFigure
    ctx.translate(position.x, toCanvasY(position.y));
    ctx.rotate(facing === 1 ? -rotation : rotation);
    ctx.scale(facing, 1);

    // Draw the bounding box as a rectangle
    const width = boundingBox.width;
    const height = boundingBox.height;
    const refX = width * boundingBox.relativeReferenceX;
    const refY = height * boundingBox.relativeReferenceY;
    
    ctx.strokeRect(-refX, -refY, width, height);
    
    ctx.restore();
  }
}
