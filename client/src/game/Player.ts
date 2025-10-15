import { GameObject, Vector2 } from "./types";
import { BoundingBox } from "./BoundingBox";
import { Bullet } from "./Bullet";
import { Terrain } from "./Terrain";
import { HumanFigure } from "../figures/HumanFigure";
import { HealthBarFigure } from "../figures/HealthBarFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";
import { ThrowingAimLineFigure } from "../figures/ThrowingAimLineFigure";
import { ShootingWeapon } from "./ShootingWeapon";
import { Grenade } from "./Grenade";
import { EntityTransform } from "./EntityTransform";
import { Physics } from "./Physics";

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
  public static readonly MAX_THROW_VELOCITY = 1000;
  private static readonly SPEED = 200;
  private static readonly JUMP_FORCE = 600;
  private static readonly HEALTHBAR_OFFSET_Y = 20;
  private static readonly AIM_ACCELERATION = 4;
  private static readonly MAX_AIM_SPEED = 3;
  private static readonly THROW_ANIMATION_DURATION_MS = 300;

  private isGrounded = false;
  public weapon: ShootingWeapon;
  private heldGrenade: Grenade;
  private weaponRelative: EntityTransform;
  private lastCollisionDebugX: number | null = null;
  private aimAngle: number = 0;
  private aimSpeed: number = 0;
  private currentWeaponIndex: number = 0;
  private currentGrenadeIndex: number = 0;
  private walkCycle: number = 0;
  private isWalking: boolean = false;
  private lastX: number = 0;

  private grenadeCount: number = 50;
  private maxGrenades: number = 50;
  private selectedWeaponCategory: 'gun' | 'grenade' = 'gun';
  private throwingAnimation: number = 0; // 0 = not throwing, 1 = full throw motion
  private throwingAnimationStartTime: number = 0;
  private throwPower: number = 0; // Values in [0.0-1.0]
  private completedGrenade: Grenade | null = null; // Grenade that was just completed and needs to be added to game world

  constructor(x: number, y: number) {
    this.id = "player";
    this.transform = new EntityTransform({ x: 0, y: 0 }, 0, 1);
    this.velocity = { x: 0, y: 0 };
    this.bounds = new BoundingBox(HumanFigure.getWidth(), HumanFigure.getHeight(), 0.5, 0.0);
    this.active = false;
    this.health = 0;
    
    this.weapon = new ShootingWeapon(ShootingWeapon.ALL_WEAPONS[0]);
    this.heldGrenade = new Grenade(0, 0, { x: 0, y: 0 }, Grenade.HAND_GRENADE);
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
    this.grenadeCount = this.maxGrenades;
    this.throwPower = 0;
    this.throwingAnimation = 0;
    this.throwingAnimationStartTime = 0;
    this.completedGrenade = null;
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
      this.throwingAnimation = Math.max(0, 1 - (animationTime / Player.THROW_ANIMATION_DURATION_MS));
      
      // If animation just completed and we have a queued grenade throw, execute it
      if (this.throwingAnimation === 0 && this.throwPower > 0) {
        this.releaseThrow();
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
    this.currentWeaponIndex = (this.currentWeaponIndex + 1) % ShootingWeapon.ALL_WEAPONS.length;
    this.weapon = new ShootingWeapon(ShootingWeapon.ALL_WEAPONS[this.currentWeaponIndex]);
    console.log(`Switched to weapon: ${this.weapon.name}`);
  }

  switchToNextGrenade(): void {
    this.currentGrenadeIndex = (this.currentGrenadeIndex + 1) % Grenade.ALL_GRENADES.length;
    this.heldGrenade = new Grenade(0, 0, { x: 0, y: 0 }, Grenade.ALL_GRENADES[this.currentGrenadeIndex]);
    console.log(`Switched to grenade: ${this.heldGrenade.name}`);
  }

  switchWeaponCategory(): void {
    if (this.selectedWeaponCategory === 'grenade') {
      // Switch back to guns
      this.selectedWeaponCategory = 'gun';
      console.log(`Switched back to gun: ${this.weapon.name}`);
    } else {
      // Switch to grenade
      this.selectedWeaponCategory = 'grenade';
      console.log(`Switched to grenade mode: ${this.heldGrenade.name}`);
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

  canStartThrow(): boolean {
    return this.grenadeCount > 0;
  }

  setThrowPower(power: number): void {
    this.throwPower = power;
  }

  private getThrowMultiplier(): number {
    // Maps throwPower [0.0, 1.0] to [0.2, 1.0]
    return 0.2 + (this.throwPower * 0.8);
  }

  startThrow(): void {
    if (this.grenadeCount <= 0) return;
    
    this.grenadeCount--;
    // Start throwing animation (throwPower is already set by GameEngine)
    this.throwingAnimation = 1;
    this.throwingAnimationStartTime = Date.now();
    console.log(`[PLAYER] Started grenade throw animation with power: ${this.throwPower.toFixed(2)} (multiplier: ${this.getThrowMultiplier().toFixed(2)}). Remaining: ${this.grenadeCount}/${this.maxGrenades}`);
  }

  private releaseThrow(): void {
    console.log(`[PLAYER] Releasing grenade throw with power: ${this.throwPower.toFixed(2)}`);
    if (this.throwPower <= 0) return;
    
    const multiplier = this.getThrowMultiplier();
    const velocity = Player.MAX_THROW_VELOCITY * multiplier;
    
    console.log(`[GRENADE THROW] throwPower: ${this.throwPower.toFixed(2)}, multiplier: ${multiplier.toFixed(2)}, velocity magnitude: ${velocity.toFixed(1)}`);
    
    const releaseTransform = this.getThrowingReleaseTransform();
    
    const throwAngle = this.aimAngle;
    const throwVelocity = {
      x: Math.cos(throwAngle) * this.transform.facing * velocity,
      y: Math.sin(throwAngle) * velocity
    };
    
    const grenadeX = releaseTransform.position.x;
    const grenadeY = releaseTransform.position.y;
    
    console.log(`[GRENADE THROW] Player hand position: (${grenadeX.toFixed(1)}, ${grenadeY.toFixed(1)}), throw angle: ${(throwAngle * 180 / Math.PI).toFixed(1)}°, velocity: (${throwVelocity.x.toFixed(1)}, ${throwVelocity.y.toFixed(1)})`);
    console.log(`[PLAYER] Executed queued grenade throw with multiplier: ${multiplier.toFixed(2)}. Player position: (${this.transform.position.x.toFixed(1)}, ${this.transform.position.y.toFixed(1)}), aim angle: ${(this.aimAngle * 180 / Math.PI).toFixed(1)}°`);
    
    this.throwPower = 0;
    
    const thrownGrenade = this.heldGrenade;
    thrownGrenade.prepareForThrow(grenadeX, grenadeY, throwVelocity);
    
    this.heldGrenade = new Grenade(0, 0, { x: 0, y: 0 }, Grenade.ALL_GRENADES[this.currentGrenadeIndex]);
    
    this.completedGrenade = thrownGrenade;
    console.log(`[PLAYER] Completed grenade throw: ${thrownGrenade}`);
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

  getEntityLabel(): string {
    return 'Player';
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
    if (this.selectedWeaponCategory === 'gun') {
      this.weapon.render({
        ctx,
        transform: this.getAbsoluteWeaponTransform(),
        showAimLine: true
      });
    } else {
      const releaseTransform = this.getThrowingReleaseTransform();
      
      // Render the held grenade
      this.heldGrenade.transform = this.getAbsoluteWeaponTransform();
      this.heldGrenade.render(ctx);
      
      ThrowingAimLineFigure.render({
        ctx,
        transform: releaseTransform,
        velocity: Player.MAX_THROW_VELOCITY * 1.0,
        mode: "Max"
      });
      
      // Show current charging line if actively charging
      if (this.throwPower > 0) {
        ThrowingAimLineFigure.render({
          ctx,
          transform: releaseTransform,
          velocity: Player.MAX_THROW_VELOCITY * this.getThrowMultiplier(),
          mode: "Charging"
        });
      }
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
