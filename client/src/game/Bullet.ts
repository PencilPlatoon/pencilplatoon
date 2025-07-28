import { GameObject, Vector2 } from "./types";
import { BoundingBox } from "./BoundingBox";
import { Terrain } from "./Terrain";
import { BulletFigure } from "../figures/BulletFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";
import { EntityTransform } from "./EntityTransform";

declare global {
  interface Window {
    __DEBUG_MODE__?: boolean;
  }
}

export class Bullet implements GameObject {
  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  damage: number;
  color: string;
  private lifeTime = 0;
  private maxLifeTime = 3; // seconds
  private initialPosition: Vector2;
  private maxTravelDistance = 1000;
  public previousPosition: Vector2;

  constructor(
    x: number,
    y: number,
    direction: Vector2,
    speed: number,
    damage: number,
    color: string
  ) {
    this.id = `bullet_${Date.now()}_${Math.random()}`;
    this.transform = new EntityTransform({ x, y }, 0, 1);
    this.initialPosition = { x, y };
    this.previousPosition = { x, y };
    this.velocity = {
      x: direction.x * speed,
      y: direction.y * speed
    };
    this.bounds = new BoundingBox(6, 6, 0.5, 0.5);
    this.active = true;
    this.damage = damage;
    this.color = color;
  }

  update(deltaTime: number) {
    if (!this.active) return;

    this.previousPosition = { x: this.transform.position.x, y: this.transform.position.y };
    // Update position
    this.transform.position.x += this.velocity.x * deltaTime;
    this.transform.position.y += this.velocity.y * deltaTime;

    // Update lifetime
    this.lifeTime += deltaTime;
    if (this.lifeTime > this.maxLifeTime) {
      this.deactivate('lifetime');
    }

    // Deactivate if traveled more than maxTravelDistance
    const dx = this.transform.position.x - this.initialPosition.x;
    const dy = this.transform.position.y - this.initialPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > this.maxTravelDistance) {
      this.deactivate('max-distance');
    }

    // Check bounds (optional, can keep for extreme out-of-bounds cases)
    if (this.transform.position.x < -100 || this.transform.position.x > Terrain.LEVEL_WIDTH + 100 || 
        this.transform.position.y < Terrain.WORLD_BOTTOM || this.transform.position.y > Terrain.WORLD_TOP + 100) {
      this.deactivate('out-of-bounds');
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;

    BulletFigure.render({
      ctx,
      transform: this.transform,
      bounds: this.bounds,
      color: this.color,
      active: this.active
    });

    BoundingBoxFigure.renderPositions(ctx, this.bounds.getBoundingPositions(this.transform.position));
  }

  getAbsoluteBounds() {
    // For Bullet, position is at center, so we can use the BoundingBox method directly
    return this.bounds.getAbsoluteBounds(this.transform.position);
  }

  deactivate(reason: string, terrain?: Terrain) {
    let terrainY = '(n/a)';
    if (terrain) {
      try {
        terrainY = String(terrain.getHeightAt(this.transform.position.x));
      } catch (e) {
        terrainY = '(out of bounds)';
      }
    }
    console.log(`[BULLET] deactivated:`, reason, 'x =', this.transform.position.x, 'y =', this.transform.position.y, 'terrainY:', terrainY);
    this.active = false;
  }
}
