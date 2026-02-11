import { GrenadeType, HoldableObject, ExplosionParameters } from "@/game/types/interfaces";
import { HAND_GRENADE } from "@/game/weapons/WeaponCatalog";
import { Vector2 } from "@/game/types/Vector2";
import { BoundingBox } from "@/game/types/BoundingBox";
import { Terrain } from "@/game/world/Terrain";
import { Physics } from "@/game/systems/Physics";
import { GrenadeFigure } from "@/rendering/GrenadeFigure";
import { generateEntityId } from "@/util/random";
import { ExplosiveProjectile } from "./ExplosiveProjectile";

/** Apply friction and slope forces to rolling velocity; returns updated velocityX. */
export const applyRollingPhysics = (
  velocityX: number,
  slope: number,
  friction: number,
  slopeForce: number,
  minVelocity: number
): number => {
  const currentSpeed = Math.abs(velocityX);
  const currentDirection = Math.sign(velocityX);

  // Friction opposes movement
  let newSpeed = currentSpeed - currentSpeed * (1 - friction);

  // Slope: positive slope opposes rightward, assists leftward
  const slopeEffect = slope * slopeForce;
  newSpeed -= slopeEffect * currentDirection;

  const result = Math.max(0, newSpeed) * currentDirection;
  return Math.abs(result) < minVelocity ? 0 : result;
};

export class Grenade extends ExplosiveProjectile implements HoldableObject {
  // Physics constants
  private static readonly ROLL_FRICTION = 0.7;
  private static readonly BOUNCE_DAMPING = 0.6;
  private static readonly ROLLING_SLOPE_FORCE = 150;
  private static readonly INITIAL_SLOPE_FORCE = 75;
  private static readonly MIN_VELOCITY_TO_STOP = 20;
  private static readonly MIN_VELOCITY_TO_ROLL = 50;

  type: GrenadeType;
  private lifeTime = 0;
  private isRolling = false;

  constructor(
    x: number,
    y: number,
    velocity: Vector2,
    grenadeType: GrenadeType = HAND_GRENADE
  ) {
    super(
      generateEntityId('grenade'),
      x, y,
      velocity,
      new BoundingBox(grenadeType.size, grenadeType.size, grenadeType.primaryHoldRatioPosition),
      grenadeType.explosionRadius,
      grenadeType.damage
    );
    this.type = grenadeType;
    this.initSVGLoading(grenadeType, grenadeType.size, grenadeType.primaryHoldRatioPosition);
  }

  getEntityLabel(): string {
    return 'grenade';
  }

  protected getTypeName(): string {
    return this.type.name;
  }

  update(deltaTime: number, terrain: Terrain) {
    if (!this.active || this.isExploded()) return;

    this.savePreviousPosition();
    this.lifeTime += deltaTime;

    if (this.lifeTime >= this.type.explosionDelay) {
      this.explode();
      return;
    }

    Physics.applyGravity(this, deltaTime);

    // Rotate grenade while flying (negative to match rolling direction)
    this.transform.rotation -= (this.velocity.x * deltaTime * 0.25);

    if (this.checkOutOfBounds(0, Terrain.LEVEL_WIDTH, Terrain.WORLD_BOTTOM, Terrain.WORLD_TOP + 100)) {
      return;
    }

    this.handleTerrainCollision(terrain);
  }

  private handleTerrainCollision(terrain: Terrain) {
    const terrainHeight = terrain.getHeightAt(this.transform.position.x);
    if (terrainHeight === null) return;

    const grenadeBottom = this.transform.position.y - this.bounds.height / 2;
    if (grenadeBottom > terrainHeight) return;

    // Hit terrain -- snap to surface
    this.transform.position.y = terrainHeight + this.bounds.height / 2;
    const slope = terrain.calculateSlopeAt(this.transform.position.x);

    if (this.isRolling) {
      this.velocity.x = applyRollingPhysics(
        this.velocity.x, slope, Grenade.ROLL_FRICTION,
        Grenade.ROLLING_SLOPE_FORCE, Grenade.MIN_VELOCITY_TO_STOP
      );
    } else if (Math.abs(this.velocity.x) > Grenade.MIN_VELOCITY_TO_ROLL) {
      this.isRolling = true;
      this.velocity.x *= Grenade.BOUNCE_DAMPING;
      this.velocity.x -= slope * Grenade.INITIAL_SLOPE_FORCE;
    } else {
      this.isRolling = true;
      this.velocity.x = applyRollingPhysics(
        this.velocity.x, slope, Grenade.ROLL_FRICTION,
        Grenade.INITIAL_SLOPE_FORCE, Grenade.MIN_VELOCITY_TO_STOP
      );
    }

    this.velocity.y = 0;
  }

  getExplosionParameters(): ExplosionParameters {
    return {
      position: this.transform.position,
      radius: this.explosionRadius,
      colors: ['#ff6600', '#ff9900', '#ffcc00', '#ffff00', '#ff0000'],
      particleCount: 20
    };
  }

  render(ctx: CanvasRenderingContext2D) {
    GrenadeFigure.render({
      ctx,
      grenade: this
    });
  }

  prepareForThrow(x: number, y: number, velocity: Vector2): void {
    this.transform.position.x = x;
    this.transform.position.y = y;
    this.previousPosition = { x, y };
    this.velocity = velocity;
    this.active = true;
    this.lifeTime = 0;
    this.resetExplosionState();
    this.isRolling = false;
  }

  updatePrimaryHoldRatioPosition(ratioPosition: Vector2): void {
    this.type.primaryHoldRatioPosition = ratioPosition;
    this.bounds.refRatioPosition = ratioPosition;
  }

  updateSecondaryHoldRatioPosition(ratioPosition: Vector2): void {
    this.type.secondaryHoldRatioPosition = ratioPosition;
  }

  updateMuzzleRatioPosition(ratioPosition: Vector2): void {
    this.type.muzzleRatioPosition = ratioPosition;
  }
}
