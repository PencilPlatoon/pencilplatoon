import { CasingEjection } from "@/game/types/interfaces";
import { Vector2 } from "@/game/types/Vector2";
import { Bullet } from "./Bullet";
import { Terrain } from "@/game/world/Terrain";
import { HumanFigure } from "@/rendering/HumanFigure";
import { ShootingWeapon } from "@/game/weapons/ShootingWeapon";
import { RIFLE_A_MAIN_OFFENSIVE } from "@/game/weapons/WeaponCatalog";
import { Combatant } from "./Combatant";

export class Enemy extends Combatant {
  public static readonly MAX_HEALTH = 75;
  private static readonly SPEED = 125;
  private static readonly DETECTION_RANGE = 400;
  private static readonly SHOOTING_RANGE = 300;
  private static readonly PATROL_RANGE = 200;
  private static readonly FIRE_INTERVAL = 800; // ms, distinct from weapon fireInterval
  private static readonly AIM_CORRECTION_SPEED = 3; // rad/s — how fast enemy re-aims
  private static readonly AIM_ACCURACY_THRESHOLD = 0.05; // rad — must be this accurate to fire

  private lastShotTime = 0;
  private weapon: ShootingWeapon;
  private patrolDirection = 1;
  private patrolStartX: number;

  private getNow: () => number;

  get maxHealth(): number { return Enemy.MAX_HEALTH; }

  getHeldObject() { return this.weapon; }

  constructor(x: number, y: number, id: string, getNow: () => number = Date.now) {
    super(id, x, y, Enemy.MAX_HEALTH);
    this.getNow = getNow;
    this.patrolStartX = x;

    this.weapon = new ShootingWeapon(RIFLE_A_MAIN_OFFENSIVE, this.getNow);
  }

  update(deltaTime: number, playerPos: Vector2, terrain: Terrain) {
    const distanceToPlayer = Math.sqrt(
      Math.pow(playerPos.x - this.transform.position.x, 2) +
      Math.pow(playerPos.y - this.transform.position.y, 2)
    );

    if (distanceToPlayer <= Enemy.DETECTION_RANGE) {
      this.chasePlayer(playerPos, deltaTime);
    } else {
      this.patrol(deltaTime);
    }

    this.applyPhysics(deltaTime, terrain);

    // Gradual aim correction toward player (replacing instant snap)
    const targetAngle = this.computeAimAngle(playerPos);
    const diff = targetAngle - this.aimAngle;
    const maxCorrection = Enemy.AIM_CORRECTION_SPEED * deltaTime;
    if (Math.abs(diff) <= maxCorrection) {
      this.aimAngle = targetAngle;
    } else {
      this.aimAngle += Math.sign(diff) * maxCorrection;
    }

    this.updateRecoilRecovery(deltaTime);
  }

  private chasePlayer(playerPos: Vector2, deltaTime: number) {
    const dx = playerPos.x - this.transform.position.x;
    this.transform.setFacing(dx >= 0 ? 1 : -1);

    if (Math.abs(dx) > 50) { // Don't get too close
      this.velocity.x = dx > 0 ? Enemy.SPEED : -Enemy.SPEED;
    } else {
      this.velocity.x = 0;
    }
  }

  private patrol(deltaTime: number) {
    // Simple patrol behavior
    const distanceFromStart = this.transform.position.x - this.patrolStartX;
    
    if (distanceFromStart > Enemy.PATROL_RANGE) {
      this.patrolDirection = -1;
    } else if (distanceFromStart < -Enemy.PATROL_RANGE) {
      this.patrolDirection = 1;
    }

    this.velocity.x = this.patrolDirection * Enemy.SPEED * 0.5;
    this.transform.setFacing(this.patrolDirection);
  }

  canShoot(playerPos: Vector2): boolean {
    const weaponTransform = this.getWeaponAbsTransform();
    const dx = playerPos.x - weaponTransform.position.x;
    const dy = playerPos.y - weaponTransform.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const now = this.getNow();
    const enemyCooldown = now - this.lastShotTime > Enemy.FIRE_INTERVAL;
    // Enemies always fire in auto mode (they don't have semi-auto behavior)
    const weaponCooldown = this.weapon.canShoot(false);
    const targetAngle = this.computeAimAngle(playerPos);
    const aimError = Math.abs(targetAngle - this.aimAngle);
    const isAimedAccurately = aimError < Enemy.AIM_ACCURACY_THRESHOLD;
    return distance <= Enemy.SHOOTING_RANGE && enemyCooldown && weaponCooldown && isAimedAccurately;
  }

  shoot(playerPos: Vector2): { bullets: Bullet[], casingEjection: CasingEjection | null } {
    this.lastShotTime = this.getNow();
    // No longer snap aim — gradual correction happens in update()
    const updatedWeaponTransform = this.getWeaponAbsTransform();
    // Enemies always fire in auto mode (they don't have semi-auto behavior)
    const bullets = this.weapon.shoot(updatedWeaponTransform, false);
    if (bullets.length > 0) {
      this.applyRecoil(this.weapon.type.recoil ?? 0);
    }
    const casingEjection = bullets.length > 0
      ? this.weapon.getCasingEjection(updatedWeaponTransform)
      : null;
    return { bullets, casingEjection };
  }

  getEntityLabel(): string {
    return 'Enemy';
  }

  getBulletExplosionParameters() {
    return {
      colors: ['#ff4444', '#ff8844', '#ffaa44', '#ffff44'],
      particleCount: 12,
      radius: 30
    };
  }

  render(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;
    
    this.weapon.render(ctx, this.getWeaponAbsTransform(), false);
    this.renderHealthBar(ctx);
    this.renderBoundingBox(ctx);
    HumanFigure.render({
      ctx,
      transform: this.transform,
      active: this.active,
      aimAngle: this.getEffectiveAimAngle(),
      isWalking: this.isWalking,
      walkCycle: this.walkCycle
    });
  }

  async waitForLoaded(): Promise<void> {
    await this.weapon.waitForLoaded();
    console.log(`Enemy loaded: ${this.id}`);
  }
}
