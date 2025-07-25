import { GameObject, Vector2, BoundingBox, WeaponType } from "./types";
import { Bullet } from "./Bullet";
import { Terrain } from "./Terrain";
import { HumanFigure } from "../figures/HumanFigure";
import { WeaponFigure } from "../figures/WeaponFigure";
import { HealthBarFigure } from "../figures/HealthBarFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";
import { Weapon } from "./Weapon";

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
  private weapon: Weapon;
  private facing = 1; // 1 for right, -1 for left
  private aimAngle = 0; // Weapon aim angle in radians
  private lastCollisionDebugX: number | null = null;

  static readonly HEALTHBAR_OFFSET_Y = 20;

  getWeaponPosition() {
    return {
      x: this.position.x + (this.facing * HumanFigure.ARM_LENGTH),
      y: this.position.y + HumanFigure.HAND_OFFSET_Y
    };
  }

  getAbsoluteBounds() {
    return {
      upperLeft: {
        x: this.position.x - this.bounds.width / 2,
        y: this.position.y + this.bounds.height
      },
      lowerRight: {
        x: this.position.x + this.bounds.width / 2,
        y: this.position.y
      }
    };
  }

  constructor(x: number, y: number) {
    this.id = "player";
    // position.y is now feet (bottom of player)
    this.position = { x, y };
    this.velocity = { x: 0, y: 1 };
    this.bounds = { width: HumanFigure.getWidth(), height: HumanFigure.getHeight() };
    this.active = true;
    this.health = 100;
    this.maxHealth = 100;
    
    this.weapon = new Weapon(Weapon.RIFLE);
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

    // Terrain collision
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
    return this.weapon.canShoot();
  }

  shoot(): Bullet | null {
    return this.weapon.shoot({
      position: this.getWeaponPosition(),
      facing: this.facing,
      aimAngle: this.aimAngle
    });
  }

  takeDamage(damage: number) {
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      this.active = false;
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    HumanFigure.render({
      ctx,
      position: this.position,
      active: this.active
    });
    this.weapon.render({
      ctx,
      position: this.getWeaponPosition(),
      facing: this.facing,
      aimAngle: this.aimAngle,
      showAimLine: true,
      aimLineLength: 100
    });
    HealthBarFigure.render({
      ctx,
      centerPosition: {
        x: this.position.x,
        y: this.position.y + HumanFigure.FIGURE_HEIGHT + Player.HEALTHBAR_OFFSET_Y
      },
      health: this.health,
      maxHealth: this.maxHealth
    });
    BoundingBoxFigure.render(ctx, this.getAbsoluteBounds());
  }
}
