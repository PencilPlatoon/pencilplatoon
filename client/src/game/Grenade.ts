import { GameObject, Vector2 } from "./types";
import { BoundingBox } from "./BoundingBox";
import { Terrain } from "./Terrain";
import { EntityTransform } from "./EntityTransform";
import { Physics } from "./Physics";
import { GrenadeFigure } from "../figures/GrenadeFigure";
import { SVGLoader, SVGInfo } from "../util/SVGLoader";
import { Weapon } from "./Weapon";

declare global {
  interface Window {
    __DEBUG_MODE__?: boolean;
  }
}

export class Grenade implements GameObject {
  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  damage: number;
  private lifeTime = 0;
  private explosionDelay = 3; // 3 seconds before explosion
  private explosionRadius = 200;
  private explosionDamage = 150;
  private isRolling = false;
  private rollFriction = 0.7; // Lower value = more friction (0.7 means 30% speed lost per frame)
  private bounceDamping = 0.6;
  public previousPosition: Vector2;
  private hasExploded = false;
  private svgInfo: SVGInfo | null = null;
  private weapon = Weapon.HAND_GRENADE;

  constructor(
    x: number,
    y: number,
    velocity: Vector2,
    damage: number
  ) {
    this.id = `grenade_${Date.now()}_${Math.random()}`;
    this.transform = new EntityTransform({ x, y }, 0, 1);
    this.previousPosition = { x, y };
    this.velocity = velocity;
    this.bounds = new BoundingBox(15, 15, 0.5, 0.5); // Match weapon visual size
    this.active = true;
    this.damage = damage;
    
    // Load grenade SVG asynchronously
    SVGLoader.get("svg/grenade.svg").then(info => {
      this.svgInfo = info;
    });
  }

  update(deltaTime: number, terrain: Terrain) {
    if (!this.active || this.hasExploded) return;

    this.previousPosition = { x: this.transform.position.x, y: this.transform.position.y };
    
    // Update lifetime
    this.lifeTime += deltaTime;

    // Check for explosion
    if (this.lifeTime >= this.explosionDelay) {
      this.explode();
      return;
    }

    // Apply gravity
    Physics.applyGravity(this, deltaTime);

    // Update position
    this.transform.position.x += this.velocity.x * deltaTime;
    this.transform.position.y += this.velocity.y * deltaTime;

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
          const frictionForce = currentSpeed * (1 - this.rollFriction); // Amount lost to friction
          let newSpeed = currentSpeed - frictionForce;
          
          // Slope effect: positive slope (uphill right) opposes rightward movement
          // Negative slope (downhill right) assists rightward movement
          const slopeForce = slope * 150; // Slope force magnitude
          if (currentDirection > 0) {
            // Moving right: uphill slope opposes, downhill slope assists
            newSpeed -= slopeForce;
          } else {
            // Moving left: uphill slope assists, downhill slope opposes
            newSpeed += slopeForce;
          }
          
          // Apply new speed in the same direction (or opposite if it went negative)
          this.velocity.x = Math.max(0, newSpeed) * currentDirection;
          
          // Stop if moving too slowly (higher threshold = stops sooner on flat terrain)
          if (Math.abs(this.velocity.x) < 20) {
            this.velocity.x = 0;
          }
        } else {
          // Start rolling if horizontal velocity is sufficient
          if (Math.abs(this.velocity.x) > 50) {
            this.isRolling = true;
            this.velocity.x *= this.bounceDamping;
            // Apply initial slope effect
            this.velocity.x -= slope * 75;
          } else {
            // Stop bouncing, start rolling
            this.isRolling = true;
            // Apply friction and slope for initial roll
            const currentSpeed = Math.abs(this.velocity.x);
            const currentDirection = Math.sign(this.velocity.x);
            const frictionForce = currentSpeed * (1 - this.rollFriction);
            const slopeForce = slope * 75;
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
      transform: this.transform,
      weapon: this.weapon,
      svgInfo: this.svgInfo,
      boundingBox: this.bounds
    });
  }

  deactivate(reason: string) {
    console.log(`[GRENADE] deactivated:`, reason, 'x =', this.transform.position.x, 'y =', this.transform.position.y);
    this.active = false;
  }

  isExploded(): boolean {
    return this.hasExploded;
  }
}
