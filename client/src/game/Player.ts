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
  
  public static readonly MAX_HEALTH = 100;
  private static readonly SPEED = 300;
  private static readonly JUMP_FORCE = 600;
  private static readonly HEALTHBAR_OFFSET_Y = 20;

  private isGrounded = false;
  public weapon: Weapon;
  private weaponRelative: EntityTransform; // Relative weapon transform
  private lastCollisionDebugX: number | null = null;
  private aimAngle: number = 0; // Angle of the arm/aim
  private currentWeaponIndex: number = 0;

  constructor(x: number, y: number) {
    this.id = "player";
    this.transform = new EntityTransform({ x: 0, y: 0 }, 0, 1);
    this.velocity = { x: 0, y: 0 };
    this.bounds = new BoundingBox(HumanFigure.getWidth(), HumanFigure.getHeight(), 0.5, 0.0);
    this.active = false;
    this.health = 0;
    
    this.weapon = new Weapon(Weapon.WEBLEY_REVOLVER);
    this.weaponRelative = new EntityTransform({ x: 0, y: 0 }, 0, 1); // Weapon relative to hand (no rotation)
    
    // Initialize with proper state
    this.reset(x, y);
  }

  private getAbsoluteWeaponTransform(): EntityTransform {
    const handTransform = HumanFigure.getForwardHandTransform(this.aimAngle);
    return this.transform.applyTransform(handTransform).applyTransform(this.weaponRelative);
  }

  getCenterOfGravity(): Vector2 {
    return this.bounds.getAbsoluteCenter(this.transform.position);
  }

  reset(x: number, y: number) {
    this.transform.setPosition(Math.max(50, x), y);
    this.velocity = { x: 0, y: 1 };
    this.health = Player.MAX_HEALTH;
    this.active = true;
    this.aimAngle = 0;
  }

  update(deltaTime: number, input: PlayerInput, terrain: Terrain) {
    // Horizontal movement
    if (input.left) {
      this.velocity.x = -Player.SPEED;
      this.transform.setFacing(-1);
    } else if (input.right) {
      this.velocity.x = Player.SPEED;
      this.transform.setFacing(1);
    } else {
      this.velocity.x = 0;
    }

    // Jumping
    if (input.jump && this.isGrounded) {
      this.velocity.y = Player.JUMP_FORCE;
      this.isGrounded = false;
    }

    // Weapon aiming with Y and H keys - update aimAngle instead of weaponRelative
    if (input.aimUp) {
      this.aimAngle = Math.min(Math.PI / 3, this.aimAngle + 2 * deltaTime); // Limit upward angle
    }
    if (input.aimDown) {
      this.aimAngle = Math.max(-Math.PI / 3, this.aimAngle - 2 * deltaTime); // Limit downward angle
    }

    // Apply gravity and update position
    Physics.applyGravity(this, deltaTime);

    // Clamp x position to at least 50
    this.transform.position.x = Math.max(50, this.transform.position.x);

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

  switchToNextWeapon(): void {
    this.currentWeaponIndex = (this.currentWeaponIndex + 1) % Weapon.ALL_WEAPONS.length;
    this.weapon = new Weapon(Weapon.ALL_WEAPONS[this.currentWeaponIndex]);
    console.log(`Switched to weapon: ${this.weapon.name}`);
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
    this.weapon.render({
      ctx,
      transform: this.getAbsoluteWeaponTransform(),
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
      maxHealth: Player.MAX_HEALTH
    });
    BoundingBoxFigure.renderPositions(ctx, this.bounds.getBoundingPositions(this.transform.position));
    HumanFigure.render({
      ctx,
      transform: this.transform,
      active: this.active,
      aimAngle: this.aimAngle
    });
  }
}
