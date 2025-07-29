import { Vector2 } from "./types";

export class EntityTransform {
  position: Vector2;
  rotation: number; // Same as aimAngle
  facing: number; // 1 for right, -1 for left

  constructor(position: Vector2, rotation: number = 0, facing: number = 1) {
    this.position = position;
    this.rotation = rotation;
    this.facing = facing;
  }

  static fromPosition(position: Vector2, rotation: number = 0, facing: number = 1): EntityTransform {
    return new EntityTransform(position, rotation, facing);
  }

  clone(): EntityTransform {
    return new EntityTransform(
      { x: this.position.x, y: this.position.y },
      this.rotation,
      this.facing
    );
  }

  setPosition(x: number, y: number): void {
    this.position.x = x;
    this.position.y = y;
  }

  setRotation(rotation: number): void {
    this.rotation = rotation;
  }

  setFacing(facing: number): void {
    this.facing = facing;
  }

  // Helper method to get weapon position based on this transform
  getWeaponPosition(armLength: number): Vector2 {
    return {
      x: this.position.x + (this.facing * armLength),
      y: this.position.y
    };
  }

  // Apply a relative transform onto this transform
  applyTransform(relativeTransform: EntityTransform): EntityTransform {
    // Calculate absolute position based on this transform and relative transform
    const absoluteX = this.position.x + (this.facing * relativeTransform.position.x);
    const absoluteY = this.position.y + relativeTransform.position.y;
    
    // Combine this facing with relative facing
    const absoluteFacing = this.facing * relativeTransform.facing;
    
    // Accumulate rotation (add relative rotation to this transform's rotation)
    const absoluteRotation = this.rotation + relativeTransform.rotation;
    
    return new EntityTransform({ x: absoluteX, y: absoluteY }, absoluteRotation, absoluteFacing);
  }
} 