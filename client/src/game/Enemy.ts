import { GameObject, Vector2 } from "./types";
import { BoundingBox } from "./BoundingBox";
import { Bullet } from "./Bullet";
import { Terrain } from "./Terrain";
import { HumanFigure } from "../figures/HumanFigure";
import { HealthBarFigure } from "../figures/HealthBarFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";
import { Weapon } from "./Weapon";
import { EntityTransform } from "./EntityTransform";

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
  maxHealth: number;
  
  private speed = 150;
  private detectionRange = 400;
  private shootingRange = 300;
  private lastShotTime = 0;
  private weapon: Weapon;
  private weaponRelative: EntityTransform; // Relative weapon transform (aim angle, facing)
  private patrolDirection = 1;
  private patrolStartX: number;
  private patrolRange = 200;
  private gravity = 1500;
  private fireInterval = 800; // ms, distinct from weapon fireInterval

  static readonly HEALTHBAR_OFFSET_Y = 20;

  getAbsoluteWeaponTransform(): EntityTransform {
    return this.transform.applyTransform(this.weaponRelative);
  }

  private computeAimAngle(target: Vector2): number {
    const weaponTransform = this.getAbsoluteWeaponTransform();
    const dx = target.x - weaponTransform.position.x;
    const dy = target.y - weaponTransform.position.y;
    return Math.atan2(dy, dx * this.transform.facing); // adjust for facing
  }

  constructor(x: number, y: number, id: string) {
    this.id = id;
    // position.y is now feet (bottom of enemy)
    this.transform = new EntityTransform({ x, y }, 0, 1);
    this.velocity = { x: 0, y: 1 };
    this.bounds = new BoundingBox(HumanFigure.getWidth(), HumanFigure.getHeight(), 0.5, 0.0);
    this.active = true;
    this.health = 75;
    this.maxHealth = 75;
    this.patrolStartX = x;
    
    this.weapon = new Weapon(Weapon.RIFLE_A_MAIN_OFFENSIVE);
    this.weaponRelative = new EntityTransform({ x: HumanFigure.ARM_LENGTH, y: HumanFigure.HAND_OFFSET_Y }, 0, 1); // Relative to enemy
  }

  update(deltaTime: number, playerPos: Vector2, terrain: Terrain) {
    const distanceToPlayer = Math.sqrt(
      Math.pow(playerPos.x - this.transform.position.x, 2) + 
      Math.pow(playerPos.y - this.transform.position.y, 2)
    );

    if (distanceToPlayer <= this.detectionRange) {
      // Chase player
      this.chasePlayer(playerPos, deltaTime);
    } else {
      // Patrol
      this.patrol(deltaTime);
    }

    // Apply gravity
    this.velocity.y -= this.gravity * deltaTime;

    // Update position
    this.transform.position.x += this.velocity.x * deltaTime;
    this.transform.position.y += this.velocity.y * deltaTime;
    // Clamp x to valid terrain range
    this.transform.position.x = Math.max(0, Math.min(this.transform.position.x, terrain.getLevelWidth()));

    // Terrain collision with gravity
    this.handleTerrainCollision(terrain);

    // Compute aim angle toward player
    const aimAngle = this.computeAimAngle(playerPos);
    // Update weapon relative rotation to aim at player
    this.weaponRelative.setRotation(aimAngle);
  }

  private chasePlayer(playerPos: Vector2, deltaTime: number) {
    const dx = playerPos.x - this.transform.position.x;
    
    if (Math.abs(dx) > 50) { // Don't get too close
      if (dx > 0) {
        this.velocity.x = this.speed;
        this.transform.setFacing(1);
      } else {
        this.velocity.x = -this.speed;
        this.transform.setFacing(-1);
      }
    } else {
      this.velocity.x = 0;
    }
  }

  private patrol(deltaTime: number) {
    // Simple patrol behavior
    const distanceFromStart = this.transform.position.x - this.patrolStartX;
    
    if (distanceFromStart > this.patrolRange) {
      this.patrolDirection = -1;
    } else if (distanceFromStart < -this.patrolRange) {
      this.patrolDirection = 1;
    }

    this.velocity.x = this.patrolDirection * this.speed * 0.5;
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
    const enemyCooldown = now - this.lastShotTime > this.fireInterval;
    const weaponCooldown = this.weapon.canShoot();
    return distance <= this.shootingRange && enemyCooldown && weaponCooldown;
  }

  shoot(playerPos: Vector2): Bullet | null {
    this.lastShotTime = Date.now();
    // Compute aim angle toward player
    const aimAngle = this.computeAimAngle(playerPos);
    // Update weapon relative rotation to aim at player
    this.weaponRelative.setRotation(aimAngle);
    
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
    HumanFigure.render({
      ctx,
      transform: this.transform,
      active: this.active
    });
    
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
      maxHealth: this.maxHealth
    });
    BoundingBoxFigure.renderPositions(ctx, this.bounds.getBoundingPositions(this.transform.position));
  }

  async waitForLoaded(): Promise<void> {
    await this.weapon.waitForLoaded();
    console.log(`Enemy loaded: ${this.id}`);
  }
}
