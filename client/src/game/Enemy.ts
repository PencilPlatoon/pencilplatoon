import { GameObject, Vector2, BoundingBox, WeaponType } from "./types";
import { Bullet } from "./Bullet";
import { Terrain } from "./Terrain";
import { HumanFigure } from "../figures/HumanFigure";
import { WeaponFigure } from "../figures/WeaponFigure";
import { HealthBarFigure } from "../figures/HealthBarFigure";
import { BoundingBoxFigure } from "../figures/BoundingBox";

declare global {
  interface Window {
    __DEBUG_MODE__?: boolean;
  }
}

export class Enemy implements GameObject {
  id: string;
  position: Vector2;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  health: number;
  maxHealth: number;
  
  private speed = 150;
  private detectionRange = 400;
  private shootingRange = 300;
  private lastShotTime = 0;
  private weapon: WeaponType;
  private facing = 1;
  private patrolDirection = 1;
  private patrolStartX: number;
  private patrolRange = 200;
  private gravity = 1500;

  static readonly HEALTHBAR_OFFSET_Y = 20;

  getWeaponPosition() {
    return {
      x: this.position.x + (this.facing * HumanFigure.ARM_LENGTH),
      y: this.position.y + HumanFigure.HAND_OFFSET_Y
    };
  }

  constructor(x: number, y: number, id: string) {
    this.id = id;
    // position.y is now feet (bottom of enemy)
    this.position = { x, y };
    this.velocity = { x: 0, y: 1 };
    this.bounds = { x: x - HumanFigure.getWidth() / 2, y, width: HumanFigure.getWidth(), height: HumanFigure.getHeight() };
    this.active = true;
    this.health = 75;
    this.maxHealth = 75;
    this.patrolStartX = x;
    
    this.weapon = {
      name: "EnemyRifle",
      damage: 15,
      fireRate: 800, // milliseconds between shots
      bulletSpeed: 600,
      bulletColor: "red"
    };
  }

  update(deltaTime: number, playerPos: Vector2, terrain: Terrain) {
    const distanceToPlayer = Math.sqrt(
      Math.pow(playerPos.x - this.position.x, 2) + 
      Math.pow(playerPos.y - this.position.y, 2)
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
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
    // Clamp x to valid terrain range
    this.position.x = Math.max(0, Math.min(this.position.x, terrain.getLevelWidth()));

    // Update bounds (feet-based)
    this.bounds.x = this.position.x - this.bounds.width / 2;
    this.bounds.y = this.position.y;

    // Terrain collision with gravity
    this.handleTerrainCollision(terrain);
  }

  private chasePlayer(playerPos: Vector2, deltaTime: number) {
    const dx = playerPos.x - this.position.x;
    
    if (Math.abs(dx) > 50) { // Don't get too close
      if (dx > 0) {
        this.velocity.x = this.speed;
        this.facing = 1;
      } else {
        this.velocity.x = -this.speed;
        this.facing = -1;
      }
    } else {
      this.velocity.x = 0;
    }
  }

  private patrol(deltaTime: number) {
    // Simple patrol behavior
    const distanceFromStart = this.position.x - this.patrolStartX;
    
    if (distanceFromStart > this.patrolRange) {
      this.patrolDirection = -1;
    } else if (distanceFromStart < -this.patrolRange) {
      this.patrolDirection = 1;
    }

    this.velocity.x = this.patrolDirection * this.speed * 0.5;
    this.facing = this.patrolDirection;
  }

  private handleTerrainCollision(terrain: Terrain) {
    const terrainY = terrain.getHeightAt(this.position.x);
    if (terrainY !== null) {
      // If feet are at or below terrain, snap to terrain (falling down)
      if (this.position.y <= terrainY && this.velocity.y <= 0) {
        this.position.y = terrainY;
        this.velocity.y = 0;
      }
    }
    // Prevent falling below world
    const worldBottom = Terrain.WORLD_BOTTOM;
    if (this.position.y < worldBottom) {
      this.position.y = worldBottom;
      this.velocity.y = 0;
    }
  }

  canShoot(): boolean {
    return Date.now() - this.lastShotTime > this.weapon.fireRate;
  }

  shoot(targetPos: Vector2): Bullet | null {
    const distance = Math.sqrt(
      Math.pow(targetPos.x - this.position.x, 2) + 
      Math.pow(targetPos.y - this.position.y, 2)
    );

    if (distance > this.shootingRange || !this.canShoot()) return null;

    this.lastShotTime = Date.now();

    // Calculate direction to target
    const dx = targetPos.x - this.position.x;
    const dy = targetPos.y - this.position.y;

    if (distance === 0) return null;

    const direction = { x: dx / distance, y: dy / distance };

    // Weapon attached to hand (end of arm)
    const { x: weaponX, y: weaponY } = this.getWeaponPosition();
    const weaponLength = 13;
    const weaponEndX = weaponX + this.facing * weaponLength;
    const weaponEndY = weaponY;

    // Create bullet at weapon tip
    const bullet = new Bullet(
      weaponEndX,
      weaponEndY,
      direction,
      this.weapon.bulletSpeed,
      this.weapon.damage,
      this.weapon.bulletColor,
      true
    );

    return bullet;
  }

  takeDamage(damage: number) {
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      this.active = false;
    }
  }

  render(ctx: CanvasRenderingContext2D, playerPos?: Vector2) {
    if (!this.active) return;
    HumanFigure.render({
      ctx,
      position: this.position,
      active: this.active
    });
    // Compute aim angle toward player if playerPos is provided
    let aimAngle = 0;
    if (playerPos) {
      const { x: weaponX, y: weaponY } = this.getWeaponPosition();
      const dx = playerPos.x - weaponX;
      const dy = playerPos.y - weaponY;
      aimAngle = Math.atan2(dy, dx * this.facing); // adjust for facing
    }
    WeaponFigure.render({
      ctx,
      position: this.getWeaponPosition(),
      facing: this.facing,
      aimAngle,
      weapon: this.weapon,
      weaponLength: 13,
      showAimLine: false
    });
    HealthBarFigure.render({
      ctx,
      centerPosition: {
        x: this.position.x,
        y: this.position.y + HumanFigure.FIGURE_HEIGHT + Enemy.HEALTHBAR_OFFSET_Y
      },
      health: this.health,
      maxHealth: this.maxHealth
    });
    BoundingBoxFigure.render(ctx, this.bounds);
  }
}
