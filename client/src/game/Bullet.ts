import { GameObject, Vector2, BoundingBox } from "./types";
import { Terrain } from "./Terrain";
import { toCanvasY } from "./Terrain";

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
  isEnemyBullet: boolean;
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
    color: string,
    isEnemyBullet: boolean
  ) {
    this.id = `bullet_${Date.now()}_${Math.random()}`;
    this.position = { x, y };
    this.initialPosition = { x, y };
    this.previousPosition = { x, y };
    this.velocity = {
      x: direction.x * speed,
      y: direction.y * speed
    };
    this.bounds = { x, y, width: 6, height: 6 };
    this.active = true;
    this.damage = damage;
    this.color = color;
    this.isEnemyBullet = isEnemyBullet;
  }

  update(deltaTime: number) {
    if (!this.active) return;

    this.previousPosition = { x: this.position.x, y: this.position.y };
    // Update position
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;

    // Update bounds
    this.bounds.x = this.position.x - this.bounds.width / 2;
    this.bounds.y = this.position.y - this.bounds.height / 2;

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

    const canvasY = toCanvasY(this.position.y) - this.bounds.height / 2;
    //console.log('[BULLET RENDER] worldY:', this.position.y, 'canvasY:', canvasY, 'x:', this.position.x - this.bounds.width / 2);

    ctx.fillStyle = this.color;
    ctx.fillRect(
      this.position.x - this.bounds.width / 2,
      canvasY,
      this.bounds.width,
      this.bounds.height
    );

    // Add glow effect
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 4;
    ctx.fillRect(
      this.position.x - this.bounds.width / 2,
      canvasY,
      this.bounds.width,
      this.bounds.height
    );
    ctx.shadowBlur = 0;

    // Draw debug bounding box if enabled
    const debugMode = typeof window !== 'undefined' && window.__DEBUG_MODE__ !== undefined ? window.__DEBUG_MODE__ : false;
    if (debugMode) {
      ctx.save();
      ctx.strokeStyle = 'red';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        this.bounds.x,
        toCanvasY(this.bounds.y + this.bounds.height),
        this.bounds.width,
        toCanvasY(this.bounds.y) - toCanvasY(this.bounds.y + this.bounds.height)
      );
      ctx.restore();
    }
  }

  deactivate(reason: string, terrain?: Terrain) {
    const owner = this.isEnemyBullet ? 'ENEMY' : 'PLAYER';
    let terrainY = '(n/a)';
    if (terrain) {
      try {
        terrainY = String(terrain.getHeightAt(this.position.x));
      } catch (e) {
        terrainY = '(out of bounds)';
      }
    }
    console.log(`[${owner} BULLET] deactivated:`, reason, 'x =', this.position.x, 'y =', this.position.y, 'terrainY:', terrainY);
    this.active = false;
  }
}
