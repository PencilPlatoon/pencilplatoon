import { GameObject, Holder, HoldableObject } from "./types";
import { Vector2 } from "./Vector2";
import { BoundingBox, AbsoluteBoundingBox } from "./BoundingBox";
import { Bullet } from "./Bullet";
import { Terrain } from "./Terrain";
import { HumanFigure } from "../figures/HumanFigure";
import { HealthBarFigure } from "../figures/HealthBarFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";
import { ThrowingAimLineFigure } from "../figures/ThrowingAimLineFigure";
import { ShootingWeapon } from "./ShootingWeapon";
import { Grenade } from "./Grenade";
import { Rocket } from "./Rocket";
import { Arsenal } from "./Arsenal";
import { LaunchingWeapon } from "./LaunchingWeapon";
import { EntityTransform } from "./EntityTransform";
import { Physics } from "./Physics";
import { ReloadLauncherMovement } from "./movement/ReloadLauncherMovement";
import { ThrowGrenadeMovement } from "./movement/ThrowGrenadeMovement";
import { PlayerInput } from "./InputResolver";

/** Maps throwPower [0.0, 1.0] to [0.2, 1.0] */
export const getThrowMultiplier = (throwPower: number): number =>
  0.2 + throwPower * 0.8;

export class Player implements GameObject, Holder {
  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  health: number;
  previousPosition: Vector2;
  
  public static readonly MAX_HEALTH = 100;
  public static readonly MAX_THROW_VELOCITY = 1000;
  private static readonly SPEED = 200;
  private static readonly JUMP_FORCE = 600;
  private static readonly HEALTHBAR_OFFSET_Y = 20;
  private static readonly AIM_ACCELERATION = 4;
  private static readonly MAX_AIM_SPEED = 3;

  private isGrounded = false;
  public arsenal: Arsenal;
  private lastLoggedWeapon: string | null = null;
  private aimAngle: number = 0;
  private aimSpeed: number = 0;
  private walkCycle: number = 0;
  private isWalking: boolean = false;
  private lastX: number = 0;

  private selectedWeaponCategory: 'gun' | 'grenade' | 'launcher' = 'gun';
  private throwPower: number = 0; // Values in [0.0-1.0]
  private completedGrenade: Grenade | null = null; // Grenade that was just completed and needs to be added to game world
  
  private reloadMovement: ReloadLauncherMovement;
  private throwMovement: ThrowGrenadeMovement;

  constructor(x: number, y: number) {
    this.id = "player";
    this.transform = new EntityTransform({ x: 0, y: 0 }, 0, 1);
    this.velocity = { x: 0, y: 0 };
    this.bounds = new BoundingBox(HumanFigure.getWidth(), HumanFigure.getHeight(), { x: 0.5, y: 0.0 });
    this.active = false;
    this.health = 0;
    this.previousPosition = { x: 0, y: 0 };
    
    this.arsenal = new Arsenal();
    this.reloadMovement = new ReloadLauncherMovement();
    this.throwMovement = new ThrowGrenadeMovement();
    
    this.reset(x, y);
  }

  getHeldObject(): HoldableObject {
    if (this.selectedWeaponCategory === 'gun') {
      return this.arsenal.heldShootingWeapon;
    } else if (this.selectedWeaponCategory === 'launcher') {
      return this.arsenal.heldLaunchingWeapon;
    } else {
      return this.arsenal.heldGrenade;
    }
  }

  getPrimaryHandAbsTransform(): EntityTransform {
    if (this.selectedWeaponCategory === 'grenade') {
      if (this.throwMovement.isInThrowState()) {
        const grenadeRelTransform = this.throwMovement.getGrenadeRelTransform(this.aimAngle);
        return this.transform.applyTransform(grenadeRelTransform);
      } else {
        const backHandTransform = HumanFigure.getBackHandTransform(0);
        return this.transform.applyTransform(backHandTransform);
      }
    } else {
      // For guns and launchers, use the forward hand
      const forwardHandTransform = HumanFigure.getForwardHandTransform(this.aimAngle);
      return this.transform.applyTransform(forwardHandTransform);
    }
  }

  /**
   * Get weapon transform where weapon extends from body pivot point.
   * Weapon line extends from pivot along aimAngle, with grip at offset distance.
   * Offset is selected based on whether weapon has secondary hold (two-handed vs single-handed).
   */
  public getWeaponRelTransform(): EntityTransform {
    // Get current weapon to determine offset type
    const holdableObject = this.getHeldObject();
    const hasSecondaryHold = holdableObject.type.secondaryHoldRatioPosition !== null;
    
    // Select appropriate offsets based on whether weapon has secondary hold
    const horizontalOffset = hasSecondaryHold 
      ? HumanFigure.WEAPON_HORIZONTAL_OFFSET_TWO_HANDED 
      : HumanFigure.WEAPON_HORIZONTAL_OFFSET_SINGLE_HANDED;
    const verticalOffset = hasSecondaryHold 
      ? HumanFigure.WEAPON_VERTICAL_OFFSET_TWO_HANDED 
      : HumanFigure.WEAPON_VERTICAL_OFFSET_SINGLE_HANDED;
    
    // Pivot point on body (where weapon line intersects body)
    const pivotX = 0; // At body center
    const pivotY = HumanFigure.ARM_Y_OFFSET + verticalOffset; // positive Y is up, so negative offset moves down

    // Grip is horizontalOffset distance from pivot along aim angle
    // Weapon transform position represents the ANCHOR point (which we've set to gripRelativeX)
    // So weapon position IS the grip position (since anchor is at the grip)
    const weaponX = pivotX + Math.cos(this.aimAngle) * horizontalOffset;
    const weaponY = pivotY + Math.sin(this.aimAngle) * horizontalOffset;
    
    return new EntityTransform(
      { x: weaponX, y: weaponY },
      this.aimAngle,
      1
    );
  }

  /**
   * Get the absolute transform of the weapon in world coordinates.
   * This represents where the weapon is positioned and oriented in the game world.
   */
  public getWeaponAbsTransform(): EntityTransform {
    const weaponRelTransform = this.getWeaponRelTransform();
    return this.transform.applyTransform(weaponRelTransform);
  }

  private calculateHandPositionsForHoldableObject(holdableObject: HoldableObject, weaponRelTransform: EntityTransform): { forwardHandPosition: Vector2 | null; backHandPosition: Vector2 | null } {
    // Calculate primary hand position (always present)
    const primaryHandRelative = HumanFigure.getHandPositionForWeapon(
      weaponRelTransform,
      holdableObject.type,
      holdableObject.bounds.height,
      holdableObject.type.primaryHoldRatioPosition
    );
    
    // Calculate secondary hand position (if present)
    const secondaryHandRelative = holdableObject.type.secondaryHoldRatioPosition !== null
      ? HumanFigure.getHandPositionForWeapon(
          weaponRelTransform,
          holdableObject.type,
          holdableObject.bounds.height,
          holdableObject.type.secondaryHoldRatioPosition
        )
      : null;
    
    // If weapon has secondary hold: forward hand on secondary position, back hand on primary position
    // If weapon has no secondary hold: forward hand on primary position, back hand goes to resting position (null)
    if (holdableObject.type.secondaryHoldRatioPosition !== null) {
      return {
        forwardHandPosition: secondaryHandRelative,
        backHandPosition: primaryHandRelative
      };
    } else {
      return {
        forwardHandPosition: primaryHandRelative,
        backHandPosition: null
      };
    }
  }

  private getThrowingReleaseAbsTransform(): EntityTransform {
    const relTransform = this.throwMovement.getReleaseRelTransform(this.aimAngle);
    const absTransform = this.transform.applyTransform(relTransform);
    // Override rotation with aim angle for throw direction (applyTransform accumulates rotations)
    return new EntityTransform(absTransform.position, this.aimAngle, absTransform.facing);
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
    this.throwPower = 0;
    this.completedGrenade = null;

    this.arsenal.reset();
    this.reloadMovement.reset();
    this.throwMovement.reset();
    
    this.arsenal.heldLaunchingWeapon.holder = this;
  }

  update(deltaTime: number, input: PlayerInput, terrain: Terrain) {
    this.previousPosition = { x: this.transform.position.x, y: this.transform.position.y };
    this.isWalking = input.left || input.right;
    
    // Update walk cycle for animation
    if (this.isWalking) {
      this.walkCycle = HumanFigure.updateWalkCycle(this.lastX, this.transform.position.x, this.walkCycle);
    } else {
      this.walkCycle = 0;
    }
    this.lastX = this.transform.position.x;

    // Update throwing animation
    if (this.throwMovement.isInThrowState() && this.throwMovement.isThrowComplete()) {
      // If animation just completed and we have a queued grenade throw, execute it
      if (this.throwPower > 0) {
        this.releaseThrow();
      }
      this.throwMovement.stopThrow();
    }

    // Update reload cycle for launcher
    if (this.reloadMovement.isInReloadState() && this.reloadMovement.isReloadComplete()) {
      this.reloadMovement.stopReload();
      this.arsenal.transferRocketToLauncher();
      console.log(`[PLAYER] Reload complete for ${this.arsenal.heldLaunchingWeapon.type.name}`);
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
    return this.arsenal.heldShootingWeapon.canShoot(newTriggerPress);
  }

  switchWeaponInCategory(): void {
    if (this.selectedWeaponCategory === 'gun') {
      this.arsenal.switchToNextWeapon();
    } else if (this.selectedWeaponCategory === 'grenade') {
      this.arsenal.switchToNextGrenade();
    } else {
      // launcher
      this.arsenal.switchToNextLauncher();
      this.arsenal.heldLaunchingWeapon.holder = this;
    }
  }

  switchWeaponCategory(): void {
    if (this.selectedWeaponCategory === 'gun') {
      this.selectedWeaponCategory = 'grenade';
    } else if (this.selectedWeaponCategory === 'grenade') {
      this.selectedWeaponCategory = 'launcher';
    } else {
      this.selectedWeaponCategory = 'gun';
    }
  }

  reload(): void {
    if (this.selectedWeaponCategory === 'gun') {
      this.arsenal.heldShootingWeapon.reload();
      console.log(`Reloaded weapon: ${this.arsenal.heldShootingWeapon.type.name}`);
    } else if (this.selectedWeaponCategory === 'launcher') {
      if (this.reloadMovement.isInReloadState()) {
        console.log(`Already reloading launcher`);
        return;
      }
      if (this.arsenal.rocketCount <= 0) {
        console.log(`No rockets available in inventory`);
        return;
      }
      if (this.arsenal.heldLaunchingWeapon.heldRocket !== null) {
        console.log(`Launcher already loaded`);
        return;
      }
      const reloadDuration = LaunchingWeapon.ALL_LAUNCHERS[this.arsenal.currentLauncherIndex].reloadAnimationDuration;
      this.reloadMovement.startReload(reloadDuration);
      this.arsenal.startReloadingRocket(this);
      console.log(`Started reloading launcher: ${this.arsenal.heldLaunchingWeapon.type.name}`);
    } else {
      // Grenades can't be reloaded - they're limited to inventory
      console.log(`Cannot reload grenades - you have ${this.arsenal.grenadeCount}/${this.arsenal.maxGrenades}`);
    }
  }

  shoot(newTriggerPress: boolean): Bullet | null {
    const weaponTransform = this.getPrimaryHandAbsTransform();
    return this.arsenal.heldShootingWeapon.shoot(weaponTransform, newTriggerPress);
  }

  canStartThrow(): boolean {
    return this.arsenal.grenadeCount > 0;
  }

  setThrowPower(power: number): void {
    this.throwPower = power;
  }

  private getThrowMultiplier(): number {
    return getThrowMultiplier(this.throwPower);
  }

  startThrow(): void {
    if (this.arsenal.grenadeCount <= 0) return;
    
    this.arsenal.grenadeCount--;
    // Start throwing animation (throwPower is already set by GameEngine)
    this.throwMovement.startThrow();
    console.log(`[PLAYER] Started grenade throw with power: ${this.throwPower.toFixed(2)} (multiplier: ${this.getThrowMultiplier().toFixed(2)}). Remaining: ${this.arsenal.grenadeCount}/${this.arsenal.maxGrenades}`);
  }

  private releaseThrow(): void {
    console.log(`[PLAYER] Releasing grenade throw with power: ${this.throwPower.toFixed(2)}`);
    if (this.throwPower <= 0) return;
    
    const multiplier = this.getThrowMultiplier();
    const velocity = Player.MAX_THROW_VELOCITY * multiplier;
    
    console.log(`[GRENADE THROW] throwPower: ${this.throwPower.toFixed(2)}, multiplier: ${multiplier.toFixed(2)}, velocity magnitude: ${velocity.toFixed(1)}`);
    
    const releaseTransform = this.getThrowingReleaseAbsTransform();
    
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
    
    const thrownGrenade = this.arsenal.heldGrenade;
    thrownGrenade.prepareForThrow(grenadeX, grenadeY, throwVelocity);
    
    this.arsenal.heldGrenade = new Grenade(0, 0, { x: 0, y: 0 }, Grenade.ALL_GRENADES[this.arsenal.currentGrenadeIndex]);
    
    this.completedGrenade = thrownGrenade;
    console.log(`[PLAYER] Completed grenade throw: ${thrownGrenade}`);
  }

  getCompletedGrenadeThrow(): Grenade | null {
    // This method is called by GameEngine to check if a grenade throw was completed
    const grenade = this.completedGrenade;
    this.completedGrenade = null; // Clear it after returning
    return grenade;
  }

  launch(newTriggerPress: boolean): Rocket | null {
    const launcher = this.arsenal.heldLaunchingWeapon;
    if (!launcher.canLaunch(newTriggerPress) || this.reloadMovement.isInReloadState()) {
      return null;
    }
    
    const weaponTransform = this.getPrimaryHandAbsTransform();
    const rocket = launcher.launch(weaponTransform);
    if (rocket) {
      this.arsenal.rocketCount--;
      
      if (this.arsenal.rocketCount > 0) {
        const reloadDuration = LaunchingWeapon.ALL_LAUNCHERS[this.arsenal.currentLauncherIndex].reloadAnimationDuration;
        this.reloadMovement.startReload(reloadDuration);
        this.arsenal.startReloadingRocket(this);
        console.log(`[PLAYER] Auto-reloading launcher: ${this.arsenal.heldLaunchingWeapon.type.name}`);
      }
    }
    return rocket;
  }

  getGrenadeCount(): number {
    return this.arsenal.grenadeCount;
  }

  getMaxGrenades(): number {
    return this.arsenal.maxGrenades;
  }

  getRocketsLeft(): number {
    return this.arsenal.rocketCount;
  }

  getSelectedWeaponCategory(): 'gun' | 'grenade' | 'launcher' {
    return this.selectedWeaponCategory;
  }

  getEntityLabel(): string {
    return 'Player';
  }

  getBulletExplosionParameters() {
    return {
      colors: ['#ff2222', '#ff6666', '#ff9999'],
      particleCount: 12,
      radius: 30
    };
  }

  takeDamage(damage: number) {
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      this.active = false;
    }
  }

  async waitForLoaded(): Promise<void> {
    await this.arsenal.heldShootingWeapon.waitForLoaded();
    console.log(`Player loaded`);
  }

  getAbsoluteBounds() {
    return this.bounds.getAbsoluteBounds(this.transform.position);
  }

  render(ctx: CanvasRenderingContext2D, options: { skipHealthBar?: boolean } = {}) {
    // Check if we should log (once per weapon)
    const currentWeapon = this.getHeldObject();
    const shouldLogWeapon = this.lastLoggedWeapon !== currentWeapon.type.name;
    
    // Calculate weapon transform with vertical offset (player-relative)
    const weaponRelTransform = this.getWeaponRelTransform();
    const weaponAbsTransform = this.transform.applyTransform(weaponRelTransform);
    
    
    if (this.selectedWeaponCategory === 'gun') {
      this.arsenal.heldShootingWeapon.render(ctx, weaponAbsTransform, true);
    } else if (this.selectedWeaponCategory === 'grenade') {
      const releaseAbsTransform = this.getThrowingReleaseAbsTransform();
      
      // Render the held grenade
      this.arsenal.heldGrenade.transform = weaponAbsTransform;
      this.arsenal.heldGrenade.render(ctx);
      
      ThrowingAimLineFigure.render({
        ctx,
        transform: releaseAbsTransform,
        velocity: Player.MAX_THROW_VELOCITY * 1.0,
        mode: "Max"
      });
      
      // Show current charging line if actively charging
      if (this.throwPower > 0) {
        ThrowingAimLineFigure.render({
          ctx,
          transform: releaseAbsTransform,
          velocity: Player.MAX_THROW_VELOCITY * this.getThrowMultiplier(),
          mode: "Charging"
        });
      }
    } else {
      // launcher category
      const launcher = this.arsenal.heldLaunchingWeapon;
      
      // Render launcher weapon (handles rocket rendering internally if loaded)
      launcher.render(ctx, weaponAbsTransform, true);
      
      // If reloading, render the reloading rocket based on animation phase
      if (this.reloadMovement.isInReloadState() && this.arsenal.reloadingRocket) {
        const rocketTransform = this.reloadMovement.getRocketTransform({
          playerTransform: this.transform,
          aimAngle: this.aimAngle,
          launcher: this.arsenal.heldLaunchingWeapon,
          weaponAbsTransform
        });
        if (rocketTransform) {
          this.arsenal.reloadingRocket.render(ctx, rocketTransform);
        }
      }
    }
    
    if (!options.skipHealthBar) {
      HealthBarFigure.render({
        ctx,
        transform: new EntityTransform({
          x: this.transform.position.x,
          y: this.transform.position.y + HumanFigure.FIGURE_HEIGHT + Player.HEALTHBAR_OFFSET_Y
        }),
        health: this.health,
        maxHealth: Player.MAX_HEALTH
      });
    }
    BoundingBoxFigure.renderPositions(ctx, this.bounds.getBoundingPositions(this.transform.position));
    
    // Get reload back arm angle if reloading
    const reloadBackArmAngle = this.reloadMovement.getBackArmAngle(this.aimAngle);
    const isThrowingOrReloading = this.throwMovement.isInThrowState() || reloadBackArmAngle !== null;
    
    // Calculate hand positions based on weapon dual-hold system
    // Skip during animations (throwing/reloading) - let animations control hand positions
    let forwardHandPosition: Vector2 | null = null;
    let backHandPosition: Vector2 | null = null;
    
    if (!isThrowingOrReloading) {
      const holdableObject = this.getHeldObject();
      const handPositions = this.calculateHandPositionsForHoldableObject(holdableObject, weaponRelTransform);
      forwardHandPosition = handPositions.forwardHandPosition;
      backHandPosition = handPositions.backHandPosition;
    }
    
    // Update logged weapon after calculation
    if (shouldLogWeapon) {
      this.lastLoggedWeapon = currentWeapon.type.name;
    }
    
    HumanFigure.render({
      ctx,
      transform: this.transform,
      active: this.active,
      aimAngle: this.aimAngle,
      isWalking: this.isWalking,
      walkCycle: this.walkCycle,
      throwingAnimation: this.throwMovement.getThrowCycle(),
      reloadBackArmAngle,
      forwardHandPosition,
      backHandPosition
    });
  }
}

