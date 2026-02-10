import { RocketType, Holder, ExplosionParameters } from "@/game/types/interfaces";
import { Vector2 } from "@/game/types/Vector2";
import { BoundingBox } from "@/game/types/BoundingBox";
import { Terrain } from "@/game/world/Terrain";
import { EntityTransform } from "@/game/types/EntityTransform";
import { RocketFigure } from "@/rendering/RocketFigure";
import { checkAABBOverlap } from "@/game/systems/CollisionSystem";
import { STANDARD_ROCKET } from "@/game/weapons/WeaponCatalog";
import { generateEntityId } from "@/util/random";
import { ExplosiveProjectile } from "./ExplosiveProjectile";

export class Rocket extends ExplosiveProjectile {
  private static readonly STABILIZER_ROTATION_SPEED = 30;

  type: RocketType;
  stabilizerRotation: number = 0;
  isLaunched: boolean = false;

  public holder: Holder | null = null;
  private lastHolder: Holder | null = null;

  constructor(
    x: number,
    y: number,
    velocity: Vector2,
    rocketType: RocketType = STANDARD_ROCKET,
    holder: Holder | null = null
  ) {
    super(
      generateEntityId('rocket'),
      x, y,
      velocity,
      new BoundingBox(rocketType.size, rocketType.size, { x: 0.5, y: 0.5 }),
      rocketType.explosionRadius,
      rocketType.damage
    );
    this.holder = holder;
    this.type = rocketType;
    this.initSVGLoading(rocketType, rocketType.size, { x: 0.5, y: 0.5 });
  }

  getEntityLabel(): string {
    return 'rocket';
  }

  protected getTypeName(): string {
    return this.type.name;
  }

  update(deltaTime: number, terrain: Terrain) {
    if (!this.active || this.isExploded()) return;

    this.savePreviousPosition();

    this.transform.position.x += this.velocity.x * deltaTime;
    this.transform.position.y += this.velocity.y * deltaTime;

    if (this.isLaunched) {
      this.stabilizerRotation += deltaTime * Rocket.STABILIZER_ROTATION_SPEED;
    }

    if (this.lastHolder) {
      const rocketBounds = this.bounds.getAbsoluteBounds(this.transform.position);
      const holderBounds = this.lastHolder.getAbsoluteBounds();
      if (!checkAABBOverlap(rocketBounds, holderBounds)) {
        console.log(`[ROCKET] Cleared holder`);
        this.lastHolder = null;
      }
    }

    if (this.checkOutOfBounds(0, Terrain.LEVEL_WIDTH, Terrain.WORLD_BOTTOM, Terrain.WORLD_TOP + 100)) {
      return;
    }

    this.handleTerrainCollision(terrain);
  }

  private handleTerrainCollision(terrain: Terrain) {
    const terrainHeight = terrain.getHeightAt(this.transform.position.x);
    if (terrainHeight !== null) {
      const rocketBottom = this.transform.position.y - this.bounds.height / 2;
      if (rocketBottom <= terrainHeight) {
        this.explode();
      }
    }
  }

  getExplosionParameters(): ExplosionParameters {
    return {
      position: this.transform.position,
      radius: this.explosionRadius,
      colors: ['#ff0000', '#ff4400', '#ff8800', '#ffcc00', '#ffff00', '#ffffff'],
      particleCount: 20
    };
  }

  override getAbsoluteBounds() {
    if (this.holder) {
      const transform = this.holder.getPrimaryHandAbsTransform();
      return this.bounds.getAbsoluteBounds(transform.position);
    }
    return this.bounds.getAbsoluteBounds(this.transform.position);
  }

  render(ctx: CanvasRenderingContext2D, transform: EntityTransform = this.transform) {
    RocketFigure.render({
      ctx,
      rocket: this,
      transform
    });
  }

  prepareForLaunch(
    x: number,
    y: number,
    velocity: Vector2,
    holder: Holder
  ): void {
    const holderTransform = holder.getPrimaryHandAbsTransform();
    this.transform.position.x = holderTransform.position.x;
    this.transform.position.y = holderTransform.position.y;
    this.transform.rotation = holderTransform.rotation;
    this.transform.facing = holderTransform.facing;
    this.previousPosition = { x: holderTransform.position.x, y: holderTransform.position.y };
    this.velocity = velocity;
    this.active = true;
    this.resetExplosionState();
    this.isLaunched = true;
    this.stabilizerRotation = 0;
    this.holder = null;
    this.lastHolder = holder;
  }

  hasHolder(): boolean {
    return this.holder !== null;
  }

  hasLastHolder(): boolean {
    return this.lastHolder !== null;
  }
}
