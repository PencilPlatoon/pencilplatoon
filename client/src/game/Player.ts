import { GameObject, Vector2, WeaponType } from "./types";
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
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  health: number;
  maxHealth: number;
  
  private speed = 300;
  private jumpForce = 600;
  private gravity = 1500;
  private isGrounded = false;
  public weapon: Weapon;
  private weaponRelative: EntityTransform; // Relative weapon transform (aim angle, facing)
  private lastCollisionDebugX: number | null = null;

  static readonly HEALTHBAR_OFFSET_Y = 20;

  getAbsoluteWeaponTransform(): EntityTransform {
    // Calculate absolute weapon position based on player transform and weapon relative transform
    const weaponX = this.transform.position.x + (this.transform.facing * this.weaponRelative.position.x);
    const weaponY = this.transform.position.y + this.weaponRelative.position.y;
    
    // Combine player facing with weapon relative facing
    const absoluteFacing = this.transform.facing * this.weaponRelative.facing;
    
    // Weapon rotation is relative to player's facing direction
    const absoluteRotation = this.weaponRelative.rotation;
    
    return new EntityTransform({ x: weaponX, y: weaponY }, absoluteRotation, absoluteFacing);
  }

  constructor(x: number, y: number) {
    this.id = "player";
    // position.y is now feet (bottom of player)
    this.transform = new EntityTransform({ x, y }, 0, 1);
    this.velocity = { x: 0, y: 1 };
    this.bounds = new BoundingBox(HumanFigure.getWidth(), HumanFigure.getHeight(), 0.5, 0.0);
    this.active = true;
    this.health = 100;
    this.maxHealth = 100;
    
    this.weapon = new Weapon(Weapon.FNAF_BATTLE_RIFLE);
    this.weaponRelative = new EntityTransform({ x: HumanFigure.ARM_LENGTH, y: HumanFigure.HAND_OFFSET_Y }, 0, 1); // Relative to player
  }

  update(deltaTime: number, input: PlayerInput, terrain: Terrain) {
    // Horizontal movement
    if (input.left) {
      this.velocity.x = -this.speed;
      this.transform.setFacing(-1);
    } else if (input.right) {
      this.velocity.x = this.speed;
      this.transform.setFacing(1);
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
      this.weaponRelative.setRotation(Math.min(Math.PI / 3, this.weaponRelative.rotation + 2 * deltaTime)); // Limit upward angle
    }
    if (input.aimDown) {
      this.weaponRelative.setRotation(Math.max(-Math.PI / 3, this.weaponRelative.rotation - 2 * deltaTime)); // Limit downward angle
    }

    // Apply gravity
    this.velocity.y -= this.gravity * deltaTime;

    // Update position
    this.transform.position.x += this.velocity.x * deltaTime;
    this.transform.position.y += this.velocity.y * deltaTime;

    // Terrain collision
    this.handleTerrainCollision(terrain);
    if (this.lastCollisionDebugX !== this.transform.position.x) {
      this.lastCollisionDebugX = this.transform.position.x;
    }
  }

  private handleTerrainCollision(terrain: Terrain) {
    this.isGrounded = false;
    const terrainHeight = terrain.getHeightAt(this.transform.position.x);
    if (terrainHeight !== null) {
      // If feet are at or below terrain, snap to terrain (falling down)
      if (this.transform.position.y <= terrainHeight && this.velocity.y <= 0) {
        this.transform.position.y = terrainHeight;
        this.velocity.y = 0;
        this.isGrounded = true;
      }
    }
    // Prevent falling below world
    const worldBottom = Terrain.WORLD_BOTTOM;
    if (this.transform.position.y < worldBottom) {
      this.transform.position.y = worldBottom;
      this.velocity.y = 0;
      this.isGrounded = true;
    }
  }

  canShoot(): boolean {
    return this.weapon.canShoot();
  }

  shoot(): Bullet | null {
    const weaponTransform = this.getAbsoluteWeaponTransform();
    return this.weapon.shoot(weaponTransform);
  }

  takeDamage(damage: number) {
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      this.active = false;
    }
  }

  async waitForLoaded(): Promise<void> {
    await this.weapon.waitForLoaded();
    console.log(`Player loaded`);
  }

  getAbsoluteBounds() {
    return this.bounds.getAbsoluteBounds(this.transform.position);
  }

  render(ctx: CanvasRenderingContext2D) {
    HumanFigure.render({
      ctx,
      transform: this.transform,
      active: this.active
    });
    const weaponTransform = this.getAbsoluteWeaponTransform();
    this.weapon.render({
      ctx,
      transform: weaponTransform,
      showAimLine: true,
      aimLineLength: 100
    });
    HealthBarFigure.render({
      ctx,
      transform: new EntityTransform({
        x: this.transform.position.x,
        y: this.transform.position.y + HumanFigure.FIGURE_HEIGHT + Player.HEALTHBAR_OFFSET_Y
      }),
      health: this.health,
      maxHealth: this.maxHealth
    });
    BoundingBoxFigure.renderPositions(ctx, this.bounds.getBoundingPositions(this.transform.position));
  }
}
