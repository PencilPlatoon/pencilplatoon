import { Vector2 } from "./types";

export interface AbsoluteBoundingBox {
  upperLeft: Vector2; // x: min (left), y: min (top)
  lowerRight: Vector2; // x: max (right), y: max (bottom)
}

export interface BoundingPositions {
  positions: Vector2[]; // Four corners in clockwise order: top-left, top-right, bottom-right, bottom-left
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

  getBoundingPositions(referencePoint: Vector2): BoundingPositions {
    const refX = this.width * this.relativeReferenceX;
    const refY = this.height * this.relativeReferenceY;
    
    // Four corners in clockwise order: top-left, top-right, bottom-right, bottom-left
    const positions = [
      { x: referencePoint.x - refX, y: referencePoint.y + (this.height - refY) },           // top-left
      { x: referencePoint.x + (this.width - refX), y: referencePoint.y + (this.height - refY) }, // top-right
      { x: referencePoint.x + (this.width - refX), y: referencePoint.y - refY },           // bottom-right
      { x: referencePoint.x - refX, y: referencePoint.y - refY }                           // bottom-left
    ];
    
    return { positions };
  }

  getRotatedBoundingPositions(referencePoint: Vector2, facing: number, aimAngle: number): BoundingPositions {
    // Get bounding box size in local weapon space
    const w = this.width;
    const h = this.height;
    const refX = w * this.relativeReferenceX;
    const refY = h * this.relativeReferenceY; // reference point is at base
    
    // Four corners in local space (relative to reference point)
    const corners = [
      { x: -refX, y: h-refY },               // top-left
      { x: w-refX, y: h-refY },            // top-right
      { x: w-refX, y: -refY },               // bottom-right
      { x: -refX, y: -refY },                  // bottom-left
    ];

    // Apply rotation and facing, then translate to world space
    const worldCorners = corners.map(({ x, y }) => {
      // Apply rotation (matching SVG rotation: negative for right-facing)
      // Note: SVG rotation happens in canvas coordinates (Y flipped), so we need to flip Y for rotation
      const rotationAngle = facing === 1 ? -aimAngle : aimAngle;
      const rotatedX = x * Math.cos(rotationAngle) - (-y) * Math.sin(rotationAngle);
      const rotatedY = x * Math.sin(rotationAngle) + (-y) * Math.cos(rotationAngle);
      // Apply facing (flip x)
      const facedX = rotatedX * facing;
      // Translate to world space
      return { 
        x: referencePoint.x + facedX, 
        y: referencePoint.y - (facing === 1 ? rotatedY : -rotatedY) // Flip Y based on facing
      };
    });
    
    // Return the rotated bounding box with all four corners
    return {
      positions: worldCorners
    };
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