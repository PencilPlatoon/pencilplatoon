import { GameObject, GrenadeType, HoldableObject } from "../types/interfaces";
import { HAND_GRENADE } from "../weapons/WeaponCatalog";
import { Vector2 } from "../types/Vector2";
import { BoundingBox } from "../types/BoundingBox";
import { Terrain } from "../world/Terrain";
import { EntityTransform } from "../types/EntityTransform";
import { Physics } from "../systems/Physics";
import { GrenadeFigure } from "../../rendering/GrenadeFigure";
import { SVGInfo } from "../../util/SVGLoader";
import { loadSVGAndCreateBounds } from "../../util/SVGAssetLoader";

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

export class Grenade implements GameObject, HoldableObject {
  // Physics constants
  private static readonly ROLL_FRICTION = 0.7; // Lower value = more friction (0.7 means 30% speed lost per frame)
  private static readonly BOUNCE_DAMPING = 0.6; // Velocity multiplier when bouncing
  private static readonly ROLLING_SLOPE_FORCE = 150; // Slope force magnitude while rolling
  private static readonly INITIAL_SLOPE_FORCE = 75; // Slope force when starting to roll
  private static readonly MIN_VELOCITY_TO_STOP = 20; // Maximum velocity threshold to stop rolling
  private static readonly MIN_VELOCITY_TO_ROLL = 50; // Minimum velocity needed to start rolling after bounce

  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  type: GrenadeType;
  svgInfo?: SVGInfo;
  isLoaded: boolean;
  explosionRadius: number;
  explosionDamage: number;
  
  private lifeTime = 0;
  private isRolling = false;
  public previousPosition: Vector2;
  private hasExploded = false;
  private _loadPromise: Promise<void>;

  constructor(
    x: number,
    y: number,
    velocity: Vector2,
    grenadeType: GrenadeType = HAND_GRENADE
  ) {
    this.id = `grenade_${Date.now()}_${Math.random()}`;
    this.transform = new EntityTransform({ x, y }, 0, 1);
    this.previousPosition = { x, y };
    this.velocity = velocity;
    this.type = grenadeType;
    this.isLoaded = false;
    this.explosionRadius = grenadeType.explosionRadius;
    this.explosionDamage = grenadeType.damage;
    
    this.bounds = new BoundingBox(grenadeType.size, grenadeType.size, grenadeType.primaryHoldRatioPosition);
    this.active = true;
    
    // Load grenade SVG asynchronously and update bounds
    this._loadPromise = loadSVGAndCreateBounds(grenadeType, grenadeType.size, grenadeType.primaryHoldRatioPosition).then(({ bounds, svgInfo }) => {
      this.bounds = bounds;
      this.svgInfo = svgInfo;
      this.isLoaded = true;
    });
  }

  update(deltaTime: number, terrain: Terrain) {
    if (!this.active || this.hasExploded) return;

    this.previousPosition = { x: this.transform.position.x, y: this.transform.position.y };
    this.lifeTime += deltaTime;

    if (this.lifeTime >= this.type.explosionDelay) {
      this.explode();
      return;
    }

    Physics.applyGravity(this, deltaTime);

    // Rotate grenade while flying (negative to match rolling direction)
    this.transform.rotation -= (this.velocity.x * deltaTime * 0.25);

    // Check bounds first - deactivate if offscreen to avoid terrain lookup errors
    if (this.transform.position.x < 0 || this.transform.position.x >= Terrain.LEVEL_WIDTH || 
        this.transform.position.y < Terrain.WORLD_BOTTOM || this.transform.position.y > Terrain.WORLD_TOP + 100) {
      this.deactivate('out-of-bounds');
      return;
    }

    // Check terrain collision only if within bounds
    this.handleTerrainCollision(terrain);
  }

  private handleTerrainCollision(terrain: Terrain) {
    const terrainHeight = terrain.getHeightAt(this.transform.position.x);
    if (terrainHeight === null) return;

    const grenadeBottom = this.transform.position.y - this.bounds.height / 2;
    if (grenadeBottom > terrainHeight) return;

    // Hit terrain — snap to surface
    this.transform.position.y = terrainHeight + this.bounds.height / 2;
    const slope = terrain.calculateSlopeAt(this.transform.position.x);

    if (this.isRolling) {
      this.velocity.x = applyRollingPhysics(
        this.velocity.x, slope, Grenade.ROLL_FRICTION,
        Grenade.ROLLING_SLOPE_FORCE, Grenade.MIN_VELOCITY_TO_STOP
      );
    } else if (Math.abs(this.velocity.x) > Grenade.MIN_VELOCITY_TO_ROLL) {
      // Fast enough to bounce into a roll
      this.isRolling = true;
      this.velocity.x *= Grenade.BOUNCE_DAMPING;
      this.velocity.x -= slope * Grenade.INITIAL_SLOPE_FORCE;
    } else {
      // Too slow to bounce — start rolling with friction/slope
      this.isRolling = true;
      this.velocity.x = applyRollingPhysics(
        this.velocity.x, slope, Grenade.ROLL_FRICTION,
        Grenade.INITIAL_SLOPE_FORCE, Grenade.MIN_VELOCITY_TO_STOP
      );
    }

    this.velocity.y = 0;
  }

  private explode() {
    if (this.hasExploded) return;
    this.hasExploded = true;
    console.log(`[GRENADE] Exploding at (${this.transform.position.x.toFixed(1)}, ${this.transform.position.y.toFixed(1)})`);
    // The actual explosion damage will be handled by the GameEngine
    this.deactivate('exploded');
  }

  getEntityLabel(): string {
    return 'grenade';
  }

  getExplosionParameters() {
    return {
      position: this.transform.position,
      radius: this.explosionRadius,
      colors: ['#ff6600', '#ff9900', '#ffcc00', '#ffff00', '#ff0000'],
      particleCount: 20
    };
  }

  getAbsoluteBounds() {
    return this.bounds.getAbsoluteBounds(this.transform.position);
  }

  render(ctx: CanvasRenderingContext2D) {
    GrenadeFigure.render({
      ctx,
      grenade: this
    });
  }

  deactivate(reason: string) {
    console.log(`[GRENADE] deactivated:`, reason, 'x =', this.transform.position.x, 'y =', this.transform.position.y);
    this.active = false;
  }

  isExploded(): boolean {
    return this.hasExploded;
  }

  prepareForThrow(x: number, y: number, velocity: Vector2): void {
    this.transform.position.x = x;
    this.transform.position.y = y;
    this.previousPosition = { x, y };
    this.velocity = velocity;
    this.active = true;
    this.lifeTime = 0;
    this.hasExploded = false;
    this.isRolling = false;
  }

  async waitForLoaded(): Promise<void> {
    await this._loadPromise;
    console.log(`Grenade loaded: ${this.type.name}`);
  }

  updatePrimaryHoldRatioPosition(ratioPosition: Vector2): void {
    this.type.primaryHoldRatioPosition = ratioPosition;
    this.bounds.refRatioPosition = ratioPosition;
  }

  updateSecondaryHoldRatioPosition(ratioPosition: Vector2): void {
    this.type.secondaryHoldRatioPosition = ratioPosition;
  }
}
