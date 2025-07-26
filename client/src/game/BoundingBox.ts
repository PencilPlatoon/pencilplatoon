import { Vector2 } from "./types";

export interface AbsoluteBoundingBox {
  upperLeft: Vector2; // x: min (left), y: min (top)
  lowerRight: Vector2; // x: max (right), y: max (bottom)
}

export class BoundingBox {
  width: number;
  height: number;
  relativeReferenceX: number; // 0-1, fraction of width (e.g., 0.5 is center)
  relativeReferenceY: number; // 0-1, fraction of height (e.g., 0.5 is center)

  constructor(
    width: number,
    height: number,
    relativeReferenceX: number,
    relativeReferenceY: number
  ) {
    this.width = width;
    this.height = height;
    this.relativeReferenceX = relativeReferenceX;
    this.relativeReferenceY = relativeReferenceY;
  }

  getAbsoluteBounds(referencePoint: Vector2): AbsoluteBoundingBox {
    const refX = this.width * this.relativeReferenceX;
    const refY = this.height * this.relativeReferenceY;
    
    const result = {
      upperLeft: {
        x: referencePoint.x - refX,
        y: referencePoint.y + (this.height - refY)
      },
      lowerRight: {
        x: referencePoint.x + (this.width - refX),
        y: referencePoint.y - refY
      }
    };
    
    return result;
  }

  getRotatedAbsoluteBounds(referencePoint: Vector2, facing: number, aimAngle: number): AbsoluteBoundingBox {
    // Get bounding box size in local weapon space
    const w = this.width;
    const h = this.height;
    const refX = w * this.relativeReferenceX;
    const refY = h * this.relativeReferenceY; // reference point is at base
    
    // Four corners in local space (relative to reference point)
    const corners = [
      { x: -refX, y: h-refY },               // left-top
      { x: w-refX, y: h-refY },            // right-top
      { x: w-refX, y: -refY },               // right-bottom
      { x: -refX, y: -refY },                  // left-bottom
    ];

    // Apply rotation and facing, then translate to world space
    const worldCorners = corners.map(({ x, y }) => {
      // Apply rotation
      const rotatedX = x * Math.cos(aimAngle) - y * Math.sin(aimAngle);
      const rotatedY = x * Math.sin(aimAngle) + y * Math.cos(aimAngle);
      // Apply facing (flip x)
      const facedX = rotatedX * facing;
      // Translate to world space
      return { 
        x: referencePoint.x + facedX, 
        y: referencePoint.y + rotatedY 
      };
    });
    
    // Find axis-aligned bounding box
    const xs = worldCorners.map(c => c.x);
    const ys = worldCorners.map(c => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    const result = {
      upperLeft: { x: minX, y: maxY },
      lowerRight: { x: maxX, y: minY }
    };
    
    return result;
  }

  static create(
    width: number,
    height: number,
    relativeReferenceX: number,
    relativeReferenceY: number
  ): BoundingBox {
    return new BoundingBox(width, height, relativeReferenceX, relativeReferenceY);
  }
} 