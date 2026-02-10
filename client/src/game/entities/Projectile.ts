import { GameObject } from "@/game/types/interfaces";
import { Vector2 } from "@/game/types/Vector2";
import { BoundingBox, AbsoluteBoundingBox } from "@/game/types/BoundingBox";
import { EntityTransform } from "@/game/types/EntityTransform";

export abstract class Projectile implements GameObject {
  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  previousPosition: Vector2;

  constructor(
    id: string,
    x: number,
    y: number,
    velocity: Vector2,
    bounds: BoundingBox
  ) {
    this.id = id;
    this.transform = new EntityTransform({ x, y }, 0, 1);
    this.previousPosition = { x, y };
    this.velocity = velocity;
    this.bounds = bounds;
    this.active = true;
  }

  getAbsoluteBounds(): AbsoluteBoundingBox {
    return this.bounds.getAbsoluteBounds(this.transform.position);
  }

  deactivate(reason: string): void {
    console.log(`[${this.getEntityLabel().toUpperCase()}] deactivated:`, reason, 'x =', this.transform.position.x, 'y =', this.transform.position.y);
    this.active = false;
  }

  savePreviousPosition(): void {
    this.previousPosition = { x: this.transform.position.x, y: this.transform.position.y };
  }

  checkOutOfBounds(xMin: number, xMax: number, yMin: number, yMax: number): boolean {
    if (this.transform.position.x < xMin || this.transform.position.x >= xMax ||
        this.transform.position.y < yMin || this.transform.position.y > yMax) {
      this.deactivate('out-of-bounds');
      return true;
    }
    return false;
  }

  abstract getEntityLabel(): string;
}
