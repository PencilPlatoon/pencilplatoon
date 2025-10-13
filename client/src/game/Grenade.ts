import { GameObject, Vector2, GrenadeType } from "./types";
import { BoundingBox } from "./BoundingBox";
import { Terrain } from "./Terrain";
import { EntityTransform } from "./EntityTransform";
import { Physics } from "./Physics";
import { GrenadeFigure } from "../figures/GrenadeFigure";
import { SVGLoader, SVGInfo } from "../util/SVGLoader";

export class Grenade implements GameObject {
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
  damage: number;
  name: string;
  size: number;
  explosionRadius: number;
  explosionDelay: number;
  svgPath?: string;
  holdRelativeX: number;
  holdRelativeY: number;
  svgInfo: SVGInfo | null = null;
  
  private lifeTime = 0;
  private explosionDamage: number;
  private isRolling = false;
  public previousPosition: Vector2;
  private hasExploded = false;

  constructor(
    x: number,
    y: number,
    velocity: Vector2,
    grenadeType: GrenadeType = Grenade.HAND_GRENADE
  ) {
    this.id = `grenade_${Date.now()}_${Math.random()}`;
    this.transform = new EntityTransform({ x, y }, 0, 1);
    this.previousPosition = { x, y };
    this.velocity = velocity;
    
    // Copy all properties from grenadeType
    this.name = grenadeType.name;
    this.damage = grenadeType.damage;
    this.explosionRadius = grenadeType.explosionRadius;
    this.explosionDelay = grenadeType.explosionDelay;
    this.size = grenadeType.size;
    this.svgPath = grenadeType.svgPath;
    this.holdRelativeX = grenadeType.holdRelativeX;
    this.holdRelativeY = grenadeType.holdRelativeY;
    this.explosionDamage = grenadeType.damage;
    
    this.bounds = new BoundingBox(this.size, this.size, 0.5, 0.5);
    this.active = true;
    
    // Load grenade SVG asynchronously
    if (this.svgPath) {
      SVGLoader.get(this.svgPath).then(info => {
        this.svgInfo = info;
      });
    }
  }

  update(deltaTime: number, terrain: Terrain) {
    if (!this.active || this.hasExploded) return;

    this.previousPosition = { x: this.transform.position.x, y: this.transform.position.y };
    this.lifeTime += deltaTime;

    if (this.lifeTime >= this.explosionDelay) {
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
    if (terrainHeight !== null) {
      const grenadeBottom = this.transform.position.y - this.bounds.height / 2;
      
      if (grenadeBottom <= terrainHeight) {
        // Hit terrain
        this.transform.position.y = terrainHeight + this.bounds.height / 2;
        
        // Calculate terrain slope for rolling
        const slope = terrain.calculateSlopeAt(this.transform.position.x);
        
        if (this.isRolling) {
          // Already rolling - apply friction and slope effects
          const currentSpeed = Math.abs(this.velocity.x);
          const currentDirection = Math.sign(this.velocity.x);
          
          // Friction always opposes movement (subtracts from absolute speed)
          const frictionForce = currentSpeed * (1 - Grenade.ROLL_FRICTION); // Amount lost to friction
          let newSpeed = currentSpeed - frictionForce;
          
          // Slope effect: positive slope (uphill right) opposes rightward movement
          // Negative slope (downhill right) assists rightward movement
          const slopeForce = slope * Grenade.ROLLING_SLOPE_FORCE;
          if (currentDirection > 0) {
            // Moving right: uphill slope opposes, downhill slope assists
            newSpeed -= slopeForce;
          } else {
            // Moving left: uphill slope assists, downhill slope opposes
            newSpeed += slopeForce;
          }
          
          // Apply new speed in the same direction (or opposite if it went negative)
          this.velocity.x = Math.max(0, newSpeed) * currentDirection;
          
          // Stop if moving too slowly
          if (Math.abs(this.velocity.x) < Grenade.MIN_VELOCITY_TO_STOP) {
            this.velocity.x = 0;
          }
        } else {
          // Start rolling if horizontal velocity is sufficient
          if (Math.abs(this.velocity.x) > Grenade.MIN_VELOCITY_TO_ROLL) {
            this.isRolling = true;
            this.velocity.x *= Grenade.BOUNCE_DAMPING;
            this.velocity.x -= slope * Grenade.INITIAL_SLOPE_FORCE;
          } else {
            // Stop bouncing, start rolling
            this.isRolling = true;
            // Apply friction and slope for initial roll
            const currentSpeed = Math.abs(this.velocity.x);
            const currentDirection = Math.sign(this.velocity.x);
            const frictionForce = currentSpeed * (1 - Grenade.ROLL_FRICTION);
            const slopeForce = slope * Grenade.INITIAL_SLOPE_FORCE;
            let newSpeed = currentSpeed - frictionForce;
            newSpeed -= slopeForce * currentDirection; // Slope opposes uphill, assists downhill
            this.velocity.x = Math.max(0, newSpeed) * currentDirection;
          }
        }
        
        this.velocity.y = 0;
      }
    }
  }

  private explode() {
    if (this.hasExploded) return;
    this.hasExploded = true;
    console.log(`[GRENADE] Exploding at (${this.transform.position.x.toFixed(1)}, ${this.transform.position.y.toFixed(1)})`);
    // The actual explosion damage will be handled by the GameEngine
    this.deactivate('exploded');
  }

  getExplosionRadius(): number {
    return this.explosionRadius;
  }

  getExplosionDamage(): number {
    return this.explosionDamage;
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

  static readonly HAND_GRENADE: GrenadeType = {
    name: "Hand Grenade",
    damage: 150,
    explosionRadius: 200,
    explosionDelay: 3,
    size: 10,
    svgPath: "svg/grenade.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
  };

  static readonly ALL_GRENADES: GrenadeType[] = [
    Grenade.HAND_GRENADE,
  ];
}
