import { Holder, HoldableObject } from "@/game/types/interfaces";
import { Vector2 } from "@/game/types/Vector2";
import { Bullet } from "./Bullet";
import { Terrain } from "@/game/world/Terrain";
import { HumanFigure } from "@/rendering/HumanFigure";
import { ThrowingAimLineFigure } from "@/rendering/ThrowingAimLineFigure";
import { Grenade } from "./Grenade";
import { Rocket } from "./Rocket";
import { Arsenal } from "@/game/weapons/Arsenal";
import { EntityTransform } from "@/game/types/EntityTransform";
import { ReloadLauncherMovement } from "@/game/animation/ReloadLauncherMovement";
import { PlayerInput } from "@/game/InputResolver";
import { ALL_LAUNCHERS, ALL_GRENADES } from "@/game/weapons/WeaponCatalog";
import { Combatant } from "./Combatant";

/** Maps throwPower [0.0, 1.0] to [0.2, 1.0] */
export const getThrowMultiplier = (throwPower: number): number =>
  0.2 + throwPower * 0.8;

export class Player extends Combatant implements Holder {
  public static readonly MAX_HEALTH = 100;
  public static readonly MAX_THROW_VELOCITY = 1000;
  private static readonly SPEED = 200;
  private static readonly JUMP_FORCE = 600;
  private static readonly AIM_ACCELERATION = 4;
  private static readonly MAX_AIM_SPEED = 3;

  public arsenal: Arsenal;
  private lastLoggedWeapon: string | null = null;
  private aimSpeed: number = 0;

  private selectedWeaponCategory: 'gun' | 'grenade' | 'launcher' = 'gun';
  private throwPower: number = 0; // Values in [0.0-1.0]
  private completedGrenade: Grenade | null = null; // Grenade that was just completed and needs to be added to game world

  private reloadMovement: ReloadLauncherMovement;

  get maxHealth(): number { return Player.MAX_HEALTH; }

  protected isHoldingGrenade(): boolean {
    return this.selectedWeaponCategory === 'grenade';
  }

  constructor(x: number, y: number) {
    super("player", 0, 0, 0);
    this.active = false;

    this.arsenal = new Arsenal();
    this.reloadMovement = new ReloadLauncherMovement();

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
    // Update throwing animation
    if (this.throwMovement.isInThrowState() && this.throwMovement.isThrowComplete()) {
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
      this.aimAngle = Math.min(Math.PI / 3, this.aimAngle + this.aimSpeed * deltaTime);
    } else if (input.aimDown) {
      this.aimSpeed = Math.min(Player.MAX_AIM_SPEED, this.aimSpeed + Player.AIM_ACCELERATION * deltaTime);
      this.aimAngle = Math.max(-Math.PI / 3, this.aimAngle - this.aimSpeed * deltaTime);
    } else {
      this.aimSpeed = 0;
    }

    this.applyPhysics(deltaTime, terrain);
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
      const reloadDuration = ALL_LAUNCHERS[this.arsenal.currentLauncherIndex].reloadAnimationDuration;
      this.reloadMovement.startReload(reloadDuration);
      this.arsenal.startReloadingRocket(this);
      console.log(`Started reloading launcher: ${this.arsenal.heldLaunchingWeapon.type.name}`);
    } else {
      // Grenades can't be reloaded - they're limited to inventory
      console.log(`Cannot reload grenades - you have ${this.arsenal.grenadeCount}/${this.arsenal.maxGrenades}`);
    }
  }

  shoot(newTriggerPress: boolean): Bullet[] {
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
  }

  private releaseThrow(): void {
    if (this.throwPower <= 0) return;

    const multiplier = this.getThrowMultiplier();
    const velocity = Player.MAX_THROW_VELOCITY * multiplier;
    const releaseTransform = this.getThrowingReleaseAbsTransform();

    const throwAngle = this.aimAngle;
    const throwVelocity = {
      x: Math.cos(throwAngle) * this.transform.facing * velocity,
      y: Math.sin(throwAngle) * velocity
    };

    this.throwPower = 0;

    const thrownGrenade = this.arsenal.heldGrenade;
    thrownGrenade.prepareForThrow(releaseTransform.position.x, releaseTransform.position.y, throwVelocity);

    this.arsenal.heldGrenade = new Grenade(0, 0, { x: 0, y: 0 }, ALL_GRENADES[this.arsenal.currentGrenadeIndex]);
    this.completedGrenade = thrownGrenade;
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
        const reloadDuration = ALL_LAUNCHERS[this.arsenal.currentLauncherIndex].reloadAnimationDuration;
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

  async waitForLoaded(): Promise<void> {
    await this.arsenal.heldShootingWeapon.waitForLoaded();
    console.log(`Player loaded`);
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
      this.renderHealthBar(ctx);
    }
    this.renderBoundingBox(ctx);
    
    // Get reload back arm angle if reloading
    const reloadBackArmAngle = this.reloadMovement.getBackArmAngle(this.aimAngle);
    const isThrowingOrReloading = this.throwMovement.isInThrowState() || reloadBackArmAngle !== null;
    
    // Calculate hand positions based on weapon dual-hold system
    // Skip during animations (throwing/reloading) - let animations control hand positions
    let forwardHandPosition: Vector2 | null = null;
    let backHandPosition: Vector2 | null = null;
    
    if (!isThrowingOrReloading) {
      const handPositions = this.calculateHandPositions(weaponRelTransform);
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

