import { GameObject, Vector2 } from "./types";
import { BoundingBox } from "./BoundingBox";
import { Bullet } from "./Bullet";
import { Terrain } from "./Terrain";
import { HumanFigure } from "../figures/HumanFigure";
import { HealthBarFigure } from "../figures/HealthBarFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";
import { ThrowingAimLineFigure } from "../figures/ThrowingAimLineFigure";
import { Weapon } from "./Weapon";
import { Grenade } from "./Grenade";
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
  triggerPressed: boolean;
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
  private static readonly SPEED = 200;
  private static readonly JUMP_FORCE = 600;
  private static readonly HEALTHBAR_OFFSET_Y = 20;
  private static readonly AIM_ACCELERATION = 4;
  private static readonly MAX_AIM_SPEED = 3;

  private isGrounded = false;
  public weapon: Weapon;
  private weaponRelative: EntityTransform;
  private lastCollisionDebugX: number | null = null;
  private aimAngle: number = 0;
  private aimSpeed: number = 0;
  private currentWeaponIndex: number = 0;
  private walkCycle: number = 0;
  private isWalking: boolean = false;
  private lastX: number = 0;

  private grenadeCount: number = 50; // FIXME change to 5 before submitting
  private maxGrenades: number = 50; // FIXME change to 5 before submitting
  private selectedWeaponCategory: 'gun' | 'grenade' = 'gun';
  private throwingAnimation: number = 0; // 0 = not throwing, 1 = full throw motion
  private throwingAnimationStartTime: number = 0;
  private queuedThrow: { power: number } | null = null; // Grenade queued to be thrown after animation
  private completedGrenade: Grenade | null = null; // Grenade that was just completed and needs to be added to game world

  constructor(x: number, y: number) {
    this.id = "player";
    this.transform = new EntityTransform({ x: 0, y: 0 }, 0, 1);
    this.velocity = { x: 0, y: 0 };
    this.bounds = new BoundingBox(HumanFigure.getWidth(), HumanFigure.getHeight(), 0.5, 0.0);
    this.active = false;
    this.health = 0;
    
    this.weapon = new Weapon(Weapon.ALL_WEAPONS[0]);
    this.weaponRelative = new EntityTransform({ x: 0, y: 0 }, 0, 1); // Weapon relative to hand (no rotation)
    
    // Initialize with proper state
    this.reset(x, y);
  }

  private getAbsoluteWeaponTransform(): EntityTransform {
    if (this.selectedWeaponCategory === 'grenade') {
      // For grenades, use the back hand with throwing animation
      let backArmAngle = this.aimAngle;
      if (this.throwingAnimation > 0) {
        // During throwing, the back arm swings up and forward
        // Animation goes from 1 (start) to 0 (end)
        const throwProgress = 1 - this.throwingAnimation;
        backArmAngle = this.aimAngle - Math.PI * 0.3 * throwProgress; // Swing up to 30 degrees (negative for upward motion)
      }
      const backHandTransform = HumanFigure.getBackHandTransform(backArmAngle);
      return this.transform.applyTransform(backHandTransform).applyTransform(this.weaponRelative);
    } else {
      // For guns, use the forward hand
      const forwardHandTransform = HumanFigure.getForwardHandTransform(this.aimAngle);
      return this.transform.applyTransform(forwardHandTransform).applyTransform(this.weaponRelative);
    }
  }

  private getThrowingReleaseTransform(): EntityTransform {
    // Get the position where grenade will be released (at end of animation)
    const releaseAngle = this.aimAngle - Math.PI * 0.3; // Final position of throw (30 degrees up)
    const backHandTransform = HumanFigure.getBackHandTransform(releaseAngle);
    const releasePosition = this.transform.applyTransform(backHandTransform).applyTransform(this.weaponRelative).position;
    // Return transform with release position, aim angle for throw direction, and player facing
    return new EntityTransform(releasePosition, this.aimAngle, this.transform.facing);
  }

  getCenterOfGravity(): Vector2 {
    return this.bounds.getAbsoluteCenter(this.transform.position);
  }

  reset(x: number, y: number) {
    this.transform.setPosition(Math.max(50, x), y);
    this.lastX = this.transform.position.x;
    this.velocity = { x: 0, y: 1 };
    this.health = Player.MAX_HEALTH;
    this.active = true;
    this.aimAngle = 0;
  }

  update(deltaTime: number, input: PlayerInput, terrain: Terrain) {
    this.isWalking = input.left || input.right;
    
    // Update walk cycle for animation
    if (this.isWalking) {
      this.walkCycle = HumanFigure.updateWalkCycle(this.lastX, this.transform.position.x, this.walkCycle);
    } else {
      this.walkCycle = 0;
    }
    this.lastX = this.transform.position.x;

    // Update throwing animation
    if (this.throwingAnimation > 0) {
      const animationTime = Date.now() - this.throwingAnimationStartTime;
      const animationDuration = 300; // 300ms throw animation
      this.throwingAnimation = Math.max(0, 1 - (animationTime / animationDuration));
      
      // If animation just completed and we have a queued grenade throw, execute it
      if (this.throwingAnimation === 0 && this.queuedThrow) {
        this.completedGrenade = this.releaseThrow();
      }
    }

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

    if (input.jump && this.isGrounded) {
      this.velocity.y = Player.JUMP_FORCE;
      this.isGrounded = false;
    }

    if (input.aimUp) {
      this.aimSpeed = Math.min(Player.MAX_AIM_SPEED, this.aimSpeed + Player.AIM_ACCELERATION * deltaTime);
      this.aimAngle = Math.min(Math.PI / 3, this.aimAngle + this.aimSpeed * deltaTime); // Limit upward angle
    } else if (input.aimDown) {
      this.aimSpeed = Math.min(Player.MAX_AIM_SPEED, this.aimSpeed + Player.AIM_ACCELERATION * deltaTime);
      this.aimAngle = Math.max(-Math.PI / 3, this.aimAngle - this.aimSpeed * deltaTime); // Limit downward angle
    } else {
      this.aimSpeed = 0;
    }

    Physics.applyGravity(this, deltaTime);

    // Clamp x position to at least 50
    this.transform.position.x = Math.max(50, this.transform.position.x);

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

  canShoot(newTriggerPress: boolean): boolean {
    return this.weapon.canShoot(newTriggerPress);
  }

  switchToNextWeapon(): void {
    this.currentWeaponIndex = (this.currentWeaponIndex + 1) % Weapon.ALL_WEAPONS.length;
    this.weapon = new Weapon(Weapon.ALL_WEAPONS[this.currentWeaponIndex]);
    console.log(`Switched to weapon: ${this.weapon.name}`);
  }

  switchWeaponCategory(): void {
    if (this.selectedWeaponCategory === 'grenade') {
      // Switch back to guns
      this.selectedWeaponCategory = 'gun';
      this.weapon = new Weapon(Weapon.ALL_WEAPONS[this.currentWeaponIndex]);
      console.log(`Switched back to gun: ${this.weapon.name}`);
    } else {
      // Switch to grenade
      this.selectedWeaponCategory = 'grenade';
      this.weapon = new Weapon(Weapon.HAND_GRENADE);
      console.log(`Switched to grenade mode`);
    }
  }

  reloadWeapon(): void {
    if (this.selectedWeaponCategory === 'grenade') {
      // Grenades can't be reloaded - they're limited to inventory
      console.log(`Cannot reload grenades - you have ${this.grenadeCount}/${this.maxGrenades}`);
      return;
    }
    this.weapon.reload();
    console.log(`Reloaded weapon: ${this.weapon.name}`);
  }

  shoot(newTriggerPress: boolean): Bullet | null {
    const weaponTransform = this.getAbsoluteWeaponTransform();
    return this.weapon.shoot(weaponTransform, newTriggerPress);
  }

  canStartThrow(newTriggerPress: boolean): boolean {
    return this.grenadeCount > 0 && newTriggerPress;
  }

  startThrow(throwPower: number): void {
    this.grenadeCount--;
    // Start with minimum power, will be updated as key is held
    this.queuedThrow = { power: 0.4 }; // Start at 0.4 (minimum power)
    // Start throwing animation
    this.throwingAnimation = 1;
    this.throwingAnimationStartTime = Date.now();
    console.log(`[PLAYER] Started grenade throw animation with power: ${throwPower?.toFixed(2)}. Remaining: ${this.grenadeCount}/${this.maxGrenades}`);
  }

  continueThrow(throwPower: number): void {
    if (this.queuedThrow) {
      this.queuedThrow.power = throwPower;
      console.log(`[PLAYER] Updated grenade throw power to: ${throwPower.toFixed(2)}`);
    }
  }

  private releaseThrow(): Grenade | null {
    if (!this.queuedThrow) return null;
    
    // Calculate grenade throw velocity based on power and angle
    const baseVelocity = 600; // Higher base velocity for better arc
    const power = this.queuedThrow.power;
    const velocity = baseVelocity * power;
    
    console.log(`[GRENADE THROW] throwPower: ${power.toFixed(2)}, velocity magnitude: ${velocity.toFixed(1)}`);
    
    // Get the release transform (where grenade will be thrown from)
    const releaseTransform = this.getThrowingReleaseTransform();
    
    // Throw forward in the aim direction
    const throwAngle = this.aimAngle;
    const throwVelocity = {
      x: Math.cos(throwAngle) * this.transform.facing * velocity,
      y: Math.sin(throwAngle) * velocity
    };
    
    const grenadeX = releaseTransform.position.x;
    const grenadeY = releaseTransform.position.y;
    
    console.log(`[GRENADE THROW] Player hand position: (${grenadeX.toFixed(1)}, ${grenadeY.toFixed(1)}), throw angle: ${(throwAngle * 180 / Math.PI).toFixed(1)}°, velocity: (${throwVelocity.x.toFixed(1)}, ${throwVelocity.y.toFixed(1)})`);
    console.log(`[PLAYER] Executed queued grenade throw with power: ${power.toFixed(2)}. Player position: (${this.transform.position.x.toFixed(1)}, ${this.transform.position.y.toFixed(1)}), aim angle: ${(this.aimAngle * 180 / Math.PI).toFixed(1)}°`);
    
    this.queuedThrow = null; // Clear the queue
    
    return new Grenade(
      grenadeX,
      grenadeY,
      throwVelocity,
      this.weapon.damage
    );
  }

  getCompletedGrenadeThrow(): Grenade | null {
    // This method is called by GameEngine to check if a grenade throw was completed
    const grenade = this.completedGrenade;
    this.completedGrenade = null; // Clear it after returning
    return grenade;
  }

  getGrenadeCount(): number {
    return this.grenadeCount;
  }

  getMaxGrenades(): number {
    return this.maxGrenades;
  }

  getSelectedWeaponCategory(): 'gun' | 'grenade' {
    return this.selectedWeaponCategory;
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
      showAimLine: true
    });
    
    // If weapon doesn't own the aim line, render the throwing aim line here
    if (!this.weapon.ownsAimLine()) {
      const baseVelocity = 600; // Match Weapon.ts grenade base velocity
      const power = this.queuedThrow?.power || 0.7; // Use queued power or default
      const velocity = baseVelocity * power;
      
      ThrowingAimLineFigure.render({
        ctx,
        transform: this.getThrowingReleaseTransform(),
        velocity
      });
    }
    
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
      aimAngle: this.aimAngle,
      isWalking: this.isWalking,
      walkCycle: this.walkCycle,
      throwingAnimation: this.throwingAnimation
    });
  }
}
