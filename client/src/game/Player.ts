import { GameObject, Vector2, BoundingBox, WeaponType } from "./types";
import { Bullet } from "./Bullet";
import { Terrain } from "./Terrain";
import { toCanvasY } from "./Terrain";
import { useGameStore } from "../lib/stores/useGameStore";

declare global {
  interface Window {
    __DEBUG_MODE__?: boolean;
  }
}

interface PlayerInput {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
  shoot: boolean;
  aimUp: boolean;
  aimDown: boolean;
}

export class Player implements GameObject {
  id: string;
  position: Vector2;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  health: number;
  maxHealth: number;
  
  private speed = 300;
  private jumpForce = 600;
  private gravity = 1500;
  private isGrounded = false;
  private lastShotTime = 0;
  private weapon: WeaponType;
  private facing = 1; // 1 for right, -1 for left
  private aimAngle = 0; // Weapon aim angle in radians
  private lastCollisionDebugX: number | null = null;

  constructor(x: number, y: number) {
    this.id = "player";
    // position.y is now feet (bottom of player)
    this.position = { x, y };
    this.velocity = { x: 0, y: 1 };
    this.bounds = { x: x - 14, y: y, width: 28, height: 56 };
    this.active = true;
    this.health = 100;
    this.maxHealth = 100;
    
    this.weapon = {
      name: "Rifle",
      damage: 25,
      fireRate: 200, // milliseconds between shots
      bulletSpeed: 800,
      bulletColor: "orange"
    };
  }

  update(deltaTime: number, input: PlayerInput, terrain: Terrain) {
    // Horizontal movement
    if (input.left) {
      this.velocity.x = -this.speed;
      this.facing = -1;
    } else if (input.right) {
      this.velocity.x = this.speed;
      this.facing = 1;
    } else {
      this.velocity.x = 0;
    }

    // Jumping
    if (input.jump && this.isGrounded) {
      this.velocity.y = this.jumpForce;
      this.isGrounded = false;
    }

    // Weapon aiming with Y and H keys
    if (input.aimUp) {
      this.aimAngle = Math.min(Math.PI / 3, this.aimAngle + 2 * deltaTime); // Limit upward angle
    }
    if (input.aimDown) {
      this.aimAngle = Math.max(-Math.PI / 3, this.aimAngle - 2 * deltaTime); // Limit downward angle
    }

    // Apply gravity
    this.velocity.y -= this.gravity * deltaTime;

    // Update position
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;

    // Update bounds (feet-based)
    this.bounds.x = this.position.x - this.bounds.width / 2;
    this.bounds.y = this.position.y;

    // Terrain collision
    const preCollisionY = this.position.y;
    const terrainY = terrain.getHeightAt(this.position.x);
    this.handleTerrainCollision(terrain);
    if (this.lastCollisionDebugX !== this.position.x) {
      this.lastCollisionDebugX = this.position.x;
    }
  }

  private handleTerrainCollision(terrain: Terrain) {
    this.isGrounded = false;
    const terrainHeight = terrain.getHeightAt(this.position.x);
    if (terrainHeight !== null) {
      // If feet are at or below terrain, snap to terrain (falling down)
      if (this.position.y <= terrainHeight && this.velocity.y <= 0) {
        this.position.y = terrainHeight;
        this.velocity.y = 0;
        this.isGrounded = true;
      }
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

  shoot(terrain: Terrain): Bullet | null {
    if (!this.canShoot()) return null;

    this.lastShotTime = Date.now();

    // Calculate direction based on facing direction and aim angle
    const direction = {
      x: Math.cos(this.aimAngle) * this.facing,
      y: Math.sin(this.aimAngle)
    };

    // Calculate weapon tip position (matches render)
    const weaponLength = 20;
    const weaponX = this.position.x + (this.facing * 12);
    const weaponY = this.position.y + 25;
    const weaponEndX = weaponX + Math.cos(this.aimAngle) * weaponLength * this.facing;
    const weaponEndY = weaponY + Math.sin(this.aimAngle) * weaponLength;

    // Create bullet at weapon tip
    const terrainY = terrain.getHeightAt(this.position.x);
    console.log('Player shoot: player.y =', this.position.y, 'bullet spawn y =', weaponEndY, 'terrain y =', terrainY);
    const bullet = new Bullet(
      weaponEndX,
      weaponEndY,
      direction,
      this.weapon.bulletSpeed,
      this.weapon.damage,
      this.weapon.bulletColor,
      false
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
    // Draw stick figure with feet at position.y
   
    ctx.lineWidth = 2;
    // Head
    const headRadius = 8;
    const headCenterY = this.position.y + 48;
    ctx.beginPath();
    ctx.arc(this.position.x, toCanvasY(headCenterY), headRadius, 0, Math.PI * 2); // head center
    ctx.stroke();
    // Body (neck starts at bottom of head)
    ctx.beginPath();
    ctx.moveTo(this.position.x, toCanvasY(headCenterY - headRadius)); // Start at bottom of head
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
    const weaponLength = 20;
    const weaponX = this.position.x + (this.facing * 12);
    const weaponY = this.position.y + 25;
    const weaponEndX = weaponX + Math.cos(this.aimAngle) * weaponLength * this.facing;
    const weaponEndY = weaponY + Math.sin(this.aimAngle) * weaponLength;
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(weaponX, toCanvasY(weaponY));
    ctx.lineTo(weaponEndX, toCanvasY(weaponEndY));
    ctx.stroke();
    // Draw dashed aiming line
    const aimLineLength = 100;
    const aimEndX = weaponX + Math.cos(this.aimAngle) * aimLineLength * this.facing;
    const aimEndY = weaponY + Math.sin(this.aimAngle) * aimLineLength;
    ctx.strokeStyle = "red";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(weaponEndX, toCanvasY(weaponEndY));
    ctx.lineTo(aimEndX, toCanvasY(aimEndY));
    ctx.stroke();
    ctx.setLineDash([]);
    // Health bar above head
    const healthBarWidth = 30;
    const healthBarHeight = 4;
    const healthPercentage = this.health / this.maxHealth;
    ctx.fillStyle = "red";
    ctx.fillRect(
      this.position.x - healthBarWidth / 2,
      toCanvasY(headCenterY + headRadius + 20), // Move health bar above new head position
      healthBarWidth,
      healthBarHeight
    );
    ctx.fillStyle = "green";
    ctx.fillRect(
      this.position.x - healthBarWidth / 2,
      toCanvasY(headCenterY + headRadius + 20), // Move health bar above new head position
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
