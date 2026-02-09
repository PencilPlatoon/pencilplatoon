import { Vector2, Vector2Utils } from "./Vector2";
import { EntityTransform } from "./EntityTransform";

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
  refRatioPosition: Vector2; // 0-1, fraction of dimensions for reference point (e.g., {x: 0.5, y: 0.5} is center)

  constructor(
    width: number,
    height: number,
    refRatioPosition: Vector2
  ) {
    this.width = width;
    this.height = height;
    this.refRatioPosition = refRatioPosition;
  }

  getAbsoluteCenter(referencePoint: Vector2): Vector2 {
    return {
      x: referencePoint.x + this.width * (0.5 - this.refRatioPosition.x),
      y: referencePoint.y + this.height * (0.5 - this.refRatioPosition.y)
    };
  }

  getAbsoluteBounds(referencePoint: Vector2): AbsoluteBoundingBox {
    const refX = this.width * this.refRatioPosition.x;
    const refY = this.height * this.refRatioPosition.y;
    
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
    const refX = this.width * this.refRatioPosition.x;
    const refY = this.height * this.refRatioPosition.y;
    
    // Four corners in clockwise order: top-left, top-right, bottom-right, bottom-left
    const positions = [
      { x: referencePoint.x - refX, y: referencePoint.y + (this.height - refY) },           // top-left
      { x: referencePoint.x + (this.width - refX), y: referencePoint.y + (this.height - refY) }, // top-right
      { x: referencePoint.x + (this.width - refX), y: referencePoint.y - refY },           // bottom-right
      { x: referencePoint.x - refX, y: referencePoint.y - refY }                           // bottom-left
    ];
    
    return { positions };
  }

  getRotatedBoundingPositions(transform: EntityTransform): BoundingPositions {
    // Get the base bounding positions
    const basePositions = this.getBoundingPositions(transform.position);
    
    // Convert to local space (relative to reference point)
    const localCorners = basePositions.positions.map(pos => ({
      x: pos.x - transform.position.x,
      y: pos.y - transform.position.y
    }));

    // Apply rotation and facing, then translate to world space
    const worldCorners = localCorners.map(({ x, y }) => {
      // Apply rotation (matching SVG rotation: negative for right-facing)
      // Note: SVG rotation happens in canvas coordinates (Y flipped), so we need to flip Y for rotation
      const rotationAngle = transform.facing === 1 ? -transform.rotation : transform.rotation;
      const rotatedX = x * Math.cos(rotationAngle) - (-y) * Math.sin(rotationAngle);
      const rotatedY = x * Math.sin(rotationAngle) + (-y) * Math.cos(rotationAngle);
      // Apply facing (flip x)
      const facedX = rotatedX * transform.facing;
      // Translate to world space
      return { 
        x: transform.position.x + facedX, 
        y: transform.position.y - (transform.facing === 1 ? rotatedY : -rotatedY) // Flip Y based on facing
      };
    });
    
    // Return the rotated bounding box with all four corners
    return {
      positions: worldCorners
    };
  }

  /**
   * Calculate the relative position delta between two ratio positions
   * @param ratioPosition1 - First ratio position (0-1)
   * @param ratioPosition2 - Second ratio position (0-1)
   * @returns Local offset in weapon coordinates
   */
  getRelPositionDelta(ratioPosition1: Vector2, ratioPosition2: Vector2): Vector2 {
    return {
      x: this.width * (ratioPosition1.x - ratioPosition2.x),
      y: this.height * (ratioPosition1.y - ratioPosition2.y)
    };
  }

  /**
   * Get a transform for the relative position delta between two ratio positions, rotated by an angle
   * @param ratioPosition1 - First ratio position (0-1)
   * @param ratioPosition2 - Second ratio position (0-1)
   * @param rotation - Rotation angle to apply to the position delta
   * @returns EntityTransform with the rotated offset, no additional rotation or facing
   */
  getTransformForRatioPositions(ratioPosition1: Vector2, ratioPosition2: Vector2, rotation: number): EntityTransform {
    const positionDelta = this.getRelPositionDelta(ratioPosition1, ratioPosition2);
    const rotatedPosition = Vector2Utils.rotate(positionDelta, rotation);
    return new EntityTransform(rotatedPosition, 0, 1);
  }

  /**
   * Convert a relative position (in pixels, relative to anchor) to ratio coordinates
   * @param relPosition - Position in pixels relative to the reference point
   * @param clamp - Whether to clamp the result to [0, 1] range (default: true)
   * @returns Ratio coordinates (clamped if clamp is true, otherwise may be outside 0-1 range)
   */
  convertRelToRatioPosition(relPosition: Vector2, clamp: boolean = true): Vector2 {
    // Convert pixel offset to ratio offset by dividing by size
    // Add the reference position to get the absolute ratio
    const ratioX = this.refRatioPosition.x + (relPosition.x / this.width);
    const ratioY = this.refRatioPosition.y + (relPosition.y / this.height);
    const result = { x: ratioX, y: ratioY };
    
    return clamp ? Vector2Utils.clampToRatioBounds(result) : result;
  }

  static create(
    width: number,
    height: number,
    refRatioPosition: Vector2
  ): BoundingBox {
    return new BoundingBox(width, height, refRatioPosition);
  }
} 