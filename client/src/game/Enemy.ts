import { GameObject, Vector2, BoundingBox, WeaponType } from "./types";
import { Bullet } from "./Bullet";
import { Terrain } from "./Terrain";
import { toCanvasY } from "./Terrain";

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
  private isGrounded = false;

  constructor(x: number, y: number, id: string) {
    this.id = id;
    // position.y is now feet (bottom of enemy)
    this.position = { x, y };
    this.velocity = { x: 0, y: 1 };
    this.bounds = { x: x - 14, y: y, width: 28, height: 56 };
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
        this.isGrounded = true;
      } else {
        this.isGrounded = false;
      }
    } else {
      this.isGrounded = false;
    }
    // Prevent falling below world
    const worldBottom = Terrain.WORLD_BOTTOM;
    if (this.position.y < worldBottom) {
      this.position.y = worldBottom;
      this.velocity.y = 0;
      this.isGrounded = true;
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
    const weaponX = this.position.x + (this.facing * 12);
    const weaponY = this.position.y + 25;
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

  render(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;
    ctx.lineWidth = 2;
    // Head
    const headRadius = 8;
    const headCenterY = this.position.y + 48;
    ctx.beginPath();
    ctx.arc(this.position.x, toCanvasY(headCenterY), headRadius, 0, Math.PI * 2);
    ctx.stroke();
    // Body
    ctx.beginPath();
    ctx.moveTo(this.position.x, toCanvasY(headCenterY - headRadius));
    ctx.lineTo(this.position.x, toCanvasY(this.position.y + 10));
    ctx.stroke();
    // Arms
    ctx.beginPath();
    ctx.moveTo(this.position.x - 12, toCanvasY(this.position.y + 25));
    ctx.lineTo(this.position.x + 12, toCanvasY(this.position.y + 25));
    ctx.stroke();
    // Legs
    ctx.beginPath();
    ctx.moveTo(this.position.x, toCanvasY(this.position.y + 10));
    ctx.lineTo(this.position.x - 8, toCanvasY(this.position.y));
    ctx.moveTo(this.position.x, toCanvasY(this.position.y + 10));
    ctx.lineTo(this.position.x + 8, toCanvasY(this.position.y));
    ctx.stroke();
    // Weapon/arm line
    const weaponLength = 13;
    const weaponX = this.position.x + (this.facing * 12);
    const weaponY = this.position.y + 25;
    const weaponEndX = weaponX + this.facing * weaponLength;
    const weaponEndY = weaponY;
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(weaponX, toCanvasY(weaponY));
    ctx.lineTo(weaponEndX, toCanvasY(weaponEndY));
    ctx.stroke();
    // Health bar above head
    const healthBarWidth = 30;
    const healthBarHeight = 4;
    const healthPercentage = this.health / this.maxHealth;
    ctx.fillStyle = "red";
    ctx.fillRect(
      this.position.x - healthBarWidth / 2,
      toCanvasY(headCenterY + headRadius + 20),
      healthBarWidth,
      healthBarHeight
    );
    ctx.fillStyle = "green";
    ctx.fillRect(
      this.position.x - healthBarWidth / 2,
      toCanvasY(headCenterY + headRadius + 20),
      healthBarWidth * healthPercentage,
      healthBarHeight
    );
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
}
