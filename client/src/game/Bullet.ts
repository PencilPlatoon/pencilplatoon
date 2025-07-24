import { GameObject, Vector2, BoundingBox } from "./types";
import { Terrain } from "./Terrain";
import { toCanvasY } from "./Terrain";
import { BulletFigure } from "../figures/BulletFigure";

declare global {
  interface Window {
    __DEBUG_MODE__?: boolean;
  }
}

export class Bullet implements GameObject {
  id: string;
  position: Vector2;
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
    this.position = { x, y };
    this.initialPosition = { x, y };
    this.previousPosition = { x, y };
    this.velocity = {
      x: direction.x * speed,
      y: direction.y * speed
    };
    this.bounds = { width: 6, height: 6 };
    this.active = true;
    this.damage = damage;
    this.color = color;
  }

  update(deltaTime: number) {
    if (!this.active) return;

    this.previousPosition = { x: this.position.x, y: this.position.y };
    // Update position
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;

    // Update lifetime
    this.lifeTime += deltaTime;
    if (this.lifeTime > this.maxLifeTime) {
      this.deactivate('lifetime');
    }

    // Deactivate if traveled more than maxTravelDistance
    const dx = this.position.x - this.initialPosition.x;
    const dy = this.position.y - this.initialPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > this.maxTravelDistance) {
      this.deactivate('max-distance');
    }

    // Check bounds (optional, can keep for extreme out-of-bounds cases)
    if (this.position.x < -100 || this.position.x > Terrain.LEVEL_WIDTH + 100 || 
        this.position.y < Terrain.WORLD_BOTTOM || this.position.y > Terrain.WORLD_TOP + 100) {
      this.deactivate('out-of-bounds');
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;

    BulletFigure.render({
      ctx,
      position: this.position,
      bounds: this.bounds,
      color: this.color,
      active: this.active
    });
  }

  getAbsoluteBounds() {
    return {
      upperLeft: {
        x: this.position.x - this.bounds.width / 2,
        y: this.position.y + this.bounds.height
      },
      lowerRight: {
        x: this.position.x + this.bounds.width / 2,
        y: this.position.y
      }
    };
  }

  deactivate(reason: string, terrain?: Terrain) {
    let terrainY = '(n/a)';
    if (terrain) {
      try {
        terrainY = String(terrain.getHeightAt(this.position.x));
      } catch (e) {
        terrainY = '(out of bounds)';
      }
    }
    console.log(`[BULLET] deactivated:`, reason, 'x =', this.position.x, 'y =', this.position.y, 'terrainY:', terrainY);
    this.active = false;
  }
}
