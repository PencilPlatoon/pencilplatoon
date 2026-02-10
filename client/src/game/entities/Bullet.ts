import { BoundingBox } from "@/game/types/BoundingBox";
import { Terrain } from "@/game/world/Terrain";
import { BulletFigure } from "@/rendering/BulletFigure";
import { BoundingBoxFigure } from "@/rendering/BoundingBoxFigure";
import { DamageableEntity, DamageDropoff } from "@/game/types/interfaces";
import { generateEntityId } from "@/util/random";
import { Vector2 } from "@/game/types/Vector2";
import { Projectile } from "./Projectile";

const DEFAULT_MAX_TRAVEL_DISTANCE = 1500;
const PELLET_MAX_TRAVEL_DISTANCE = 800;

export class Bullet extends Projectile {
  damage: number;
  readonly isPellet: boolean;
  private readonly initialDamage: number;
  private readonly damageDropoff?: DamageDropoff;
  private lifeTime = 0;
  private initialPosition: Vector2;
  private maxTravelDistance: number;

  constructor(
    x: number,
    y: number,
    direction: Vector2,
    speed: number,
    damage: number,
    bulletSize: number,
    isPellet: boolean = false,
    damageDropoff?: DamageDropoff
  ) {
    super(
      generateEntityId('bullet'),
      x, y,
      { x: direction.x * speed, y: direction.y * speed },
      new BoundingBox(bulletSize, bulletSize, { x: 0.5, y: 0.5 })
    );
    this.initialPosition = { x, y };
    this.damage = damage;
    this.initialDamage = damage;
    this.isPellet = isPellet;
    this.damageDropoff = damageDropoff;
    this.maxTravelDistance = isPellet ? PELLET_MAX_TRAVEL_DISTANCE : DEFAULT_MAX_TRAVEL_DISTANCE;
  }

  getEntityLabel(): string {
    return 'bullet';
  }

  update(deltaTime: number) {
    if (!this.active) return;

    this.savePreviousPosition();

    this.transform.position.x += this.velocity.x * deltaTime;
    this.transform.position.y += this.velocity.y * deltaTime;

    this.lifeTime += deltaTime;

    const dx = this.transform.position.x - this.initialPosition.x;
    const dy = this.transform.position.y - this.initialPosition.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (this.damageDropoff) {
      this.damage = this.calculateDropoffDamage(distance);
    }

    if (distance > this.maxTravelDistance) {
      this.deactivate('max-distance');
    }

    this.checkOutOfBounds(-100, Terrain.LEVEL_WIDTH + 100, Terrain.WORLD_BOTTOM, Terrain.WORLD_TOP + 100);
  }

  private calculateDropoffDamage(distance: number): number {
    const { effectiveRange, minDamageRatio } = this.damageDropoff!;
    if (distance <= effectiveRange) return this.initialDamage;
    if (distance >= this.maxTravelDistance) return this.initialDamage * minDamageRatio;
    const t = (distance - effectiveRange) / (this.maxTravelDistance - effectiveRange);
    return this.initialDamage * (1 - t * (1 - minDamageRatio));
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;

    BulletFigure.render({
      ctx,
      transform: this.transform,
      bounds: this.bounds,
      isPellet: this.isPellet
    });

    BoundingBoxFigure.renderPositions(ctx, this.bounds.getBoundingPositions(this.transform.position));
  }

  getExplosionParameters(entity: DamageableEntity) {
    const config = entity.getBulletExplosionParameters();

    return {
      position: this.transform.position,
      radius: config.radius,
      colors: config.colors,
      particleCount: config.particleCount
    };
  }

  getTerrainExplosionParameters() {
    return {
      position: this.transform.position,
      radius: 25,
      colors: ['#888888', '#aaaaaa', '#666666'],
      particleCount: 8
    };
  }

  override deactivate(reason: string, terrain?: Terrain) {
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
