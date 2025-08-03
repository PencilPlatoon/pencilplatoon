import { GameObject, Vector2 } from "./types";
import { BoundingBox } from "./BoundingBox";
import { Bullet } from "./Bullet";
import { Terrain } from "./Terrain";
import { HumanFigure } from "../figures/HumanFigure";
import { HealthBarFigure } from "../figures/HealthBarFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";
import { Weapon } from "./Weapon";
import { EntityTransform } from "./EntityTransform";
import { Physics } from "./Physics";

declare global {
  interface Window {
    __DEBUG_MODE__?: boolean;
  }
}

export class Enemy implements GameObject {
  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  health: number;
  
  public static readonly MAX_HEALTH = 75;
  private static readonly SPEED = 125;
  private static readonly DETECTION_RANGE = 400;
  private static readonly SHOOTING_RANGE = 300;
  private static readonly PATROL_RANGE = 200;
  private static readonly FIRE_INTERVAL = 800; // ms, distinct from weapon fireInterval
  private static readonly HEALTHBAR_OFFSET_Y = 20;

  private lastShotTime = 0;
  private weapon: Weapon;
  private weaponRelative: EntityTransform; // Relative weapon transform
  private patrolDirection = 1;
  private patrolStartX: number;
  private aimAngle: number = 0; // Angle of the arm/aim
  private walkCycle: number = 0; // Walking animation cycle
  private isWalking: boolean = false;
  private lastX: number = 0;

  constructor(x: number, y: number, id: string) {
    this.id = id;
    // position.y is now feet (bottom of enemy)
    this.transform = new EntityTransform({ x, y }, 0, 1);
    this.velocity = { x: 0, y: 1 };
    this.bounds = new BoundingBox(HumanFigure.getWidth(), HumanFigure.getHeight(), 0.5, 0.0);
    this.active = true;
    this.health = Enemy.MAX_HEALTH;
    this.patrolStartX = x;
    this.lastX = x;
    
    this.weapon = new Weapon(Weapon.RIFLE_A_MAIN_OFFENSIVE);
    this.weaponRelative = new EntityTransform({ x: 0, y: 0 }, 0, 1); // Weapon relative to hand (no rotation)
  }

  private getAbsoluteWeaponTransform(): EntityTransform {
    const handTransform = HumanFigure.getForwardHandTransform(this.aimAngle);
    return this.transform.applyTransform(handTransform).applyTransform(this.weaponRelative);
  }

  private computeAimAngle(target: Vector2): number {
    const handTransform = HumanFigure.getForwardHandTransform(this.aimAngle);
    const absoluteHandTransform = this.transform.applyTransform(handTransform);
    const dx = target.x - absoluteHandTransform.position.x;
    const dy = target.y - absoluteHandTransform.position.y;
    return Math.atan2(dy, dx * this.transform.facing); // adjust for facing
  }

  update(deltaTime: number, playerPos: Vector2, terrain: Terrain) {
    this.isWalking = Math.abs(this.velocity.x) > 0;
    
    // Update walk cycle for animation
    if (this.isWalking) {
      this.walkCycle = HumanFigure.updateWalkCycle(this.lastX, this.transform.position.x, this.walkCycle);
    } else {
      this.walkCycle = 0;
    }
    this.lastX = this.transform.position.x;

    const distanceToPlayer = Math.sqrt(
      Math.pow(playerPos.x - this.transform.position.x, 2) + 
      Math.pow(playerPos.y - this.transform.position.y, 2)
    );

    if (distanceToPlayer <= Enemy.DETECTION_RANGE) {
      // Chase player
      this.chasePlayer(playerPos, deltaTime);
    } else {
      // Patrol
      this.patrol(deltaTime);
    }

    // Apply gravity and update position
    Physics.applyGravity(this, deltaTime);
    // Clamp x to valid terrain range
    this.transform.position.x = Math.max(50, Math.min(this.transform.position.x, terrain.getLevelWidth()));

    // Terrain collision with gravity
    this.handleTerrainCollision(terrain);

    // Update aim angle to aim at player
    this.aimAngle = this.computeAimAngle(playerPos);
  }

  private chasePlayer(playerPos: Vector2, deltaTime: number) {
    const dx = playerPos.x - this.transform.position.x;
    
    if (Math.abs(dx) > 50) { // Don't get too close
      if (dx > 0) {
        this.velocity.x = Enemy.SPEED;
        this.transform.setFacing(1);
      } else {
        this.velocity.x = -Enemy.SPEED;
        this.transform.setFacing(-1);
      }
    } else {
      this.velocity.x = 0;
    }
  }

  private patrol(deltaTime: number) {
    // Simple patrol behavior
    const distanceFromStart = this.transform.position.x - this.patrolStartX;
    
    if (distanceFromStart > Enemy.PATROL_RANGE) {
      this.patrolDirection = -1;
    } else if (distanceFromStart < -Enemy.PATROL_RANGE) {
      this.patrolDirection = 1;
    }

    this.velocity.x = this.patrolDirection * Enemy.SPEED * 0.5;
    this.transform.setFacing(this.patrolDirection);
  }

  private handleTerrainCollision(terrain: Terrain) {
    const terrainY = terrain.getHeightAt(this.transform.position.x);
    if (terrainY !== null) {
      // If feet are at or below terrain, snap to terrain (falling down)
      if (this.transform.position.y <= terrainY && this.velocity.y <= 0) {
        this.transform.position.y = terrainY;
        this.velocity.y = 0;
      }
    }
    // Prevent falling below world
    const worldBottom = Terrain.WORLD_BOTTOM;
    if (this.transform.position.y < worldBottom) {
      this.transform.position.y = worldBottom;
      this.velocity.y = 0;
    }
  }

  canShoot(playerPos: Vector2): boolean {
    const weaponTransform = this.getAbsoluteWeaponTransform();
    const dx = playerPos.x - weaponTransform.position.x;
    const dy = playerPos.y - weaponTransform.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const now = Date.now();
    const enemyCooldown = now - this.lastShotTime > Enemy.FIRE_INTERVAL;
    const weaponCooldown = this.weapon.canShoot();
    return distance <= Enemy.SHOOTING_RANGE && enemyCooldown && weaponCooldown;
  }

  shoot(playerPos: Vector2): Bullet | null {
    this.lastShotTime = Date.now();
    // Update aim angle to aim at player
    this.aimAngle = this.computeAimAngle(playerPos);
    
    // Get updated weapon transform with new aim angle
    const updatedWeaponTransform = this.getAbsoluteWeaponTransform();
    return this.weapon.shoot(updatedWeaponTransform);
  }

  takeDamage(damage: number) {
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      this.active = false;
    }
  }

  getAbsoluteBounds() {
    return this.bounds.getAbsoluteBounds(this.transform.position);
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;
    
    this.weapon.render({
      ctx,
      transform: this.getAbsoluteWeaponTransform(),
      showAimLine: false
    });
    HealthBarFigure.render({
      ctx,
      transform: new EntityTransform({
        x: this.transform.position.x,
        y: this.transform.position.y + HumanFigure.FIGURE_HEIGHT + Enemy.HEALTHBAR_OFFSET_Y
      }),
      health: this.health,
      maxHealth: Enemy.MAX_HEALTH
    });
    BoundingBoxFigure.renderPositions(ctx, this.bounds.getBoundingPositions(this.transform.position));
    HumanFigure.render({
      ctx,
      transform: this.transform,
      active: this.active,
      aimAngle: this.aimAngle,
      isWalking: this.isWalking,
      walkCycle: this.walkCycle
    });
  }

  async waitForLoaded(): Promise<void> {
    await this.weapon.waitForLoaded();
    console.log(`Enemy loaded: ${this.id}`);
  }
}
