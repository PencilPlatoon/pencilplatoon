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



  static create(
    width: number,
    height: number,
    relativeReferenceX: number,
    relativeReferenceY: number
  ): BoundingBox {
    return new BoundingBox(width, height, relativeReferenceX, relativeReferenceY);
  }
} 