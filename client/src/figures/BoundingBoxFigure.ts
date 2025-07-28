import { AbsoluteBoundingBox, BoundingBox, BoundingPositions } from "../game/BoundingBox";
import { Vector2 } from "../game/types";
import { toCanvasY } from "../game/Terrain";
import { EntityTransform } from "../game/EntityTransform";

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

  static renderPositions(ctx: CanvasRenderingContext2D, boundingPositions: BoundingPositions) {
    const debugMode = typeof window !== 'undefined' && window.__DEBUG_MODE__ !== undefined ? window.__DEBUG_MODE__ : false;
    if (!debugMode) return;

    ctx.save();
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1;

    // Render rotated bounding box using the provided positions
    const positions = boundingPositions.positions;
    ctx.beginPath();
    ctx.moveTo(positions[0].x, toCanvasY(positions[0].y));
    ctx.lineTo(positions[1].x, toCanvasY(positions[1].y));
    ctx.lineTo(positions[2].x, toCanvasY(positions[2].y));
    ctx.lineTo(positions[3].x, toCanvasY(positions[3].y));
    ctx.closePath();
    ctx.stroke();
    
    ctx.restore();
  }

  static renderRotated({
    ctx,
    boundingBox,
    transform
  }: {
    ctx: CanvasRenderingContext2D;
    boundingBox: BoundingBox;
    transform: EntityTransform;
  }) {
    const position = transform.position;
    const debugMode = typeof window !== 'undefined' && window.__DEBUG_MODE__ !== undefined ? window.__DEBUG_MODE__ : false;
    if (!debugMode) return;

    ctx.save();
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 1;

    // Apply the same transformations as WeaponFigure
    ctx.translate(position.x, toCanvasY(position.y));
    ctx.rotate(transform.facing === 1 ? -transform.rotation : transform.rotation);
    ctx.scale(transform.facing, 1);

    // Draw the bounding box as a rectangle
    const width = boundingBox.width;
    const height = boundingBox.height;
    const refX = width * boundingBox.relativeReferenceX;
    const refY = height * boundingBox.relativeReferenceY;
    
    ctx.strokeRect(-refX, -refY, width, height);
    
    ctx.restore();
  }
}
