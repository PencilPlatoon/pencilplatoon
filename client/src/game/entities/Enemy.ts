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
    this.aimAngle = this.computeAimAngle(playerPos);
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
    return distance <= Enemy.SHOOTING_RANGE && enemyCooldown && weaponCooldown;
  }

  shoot(playerPos: Vector2): Bullet | null {
    this.lastShotTime = this.getNow();
    // Update aim angle to aim at player
    this.aimAngle = this.computeAimAngle(playerPos);
    
    // Get updated weapon transform with new aim angle
    const updatedWeaponTransform = this.getWeaponAbsTransform();
    // Enemies always fire in auto mode (they don't have semi-auto behavior)
    return this.weapon.shoot(updatedWeaponTransform, false);
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
      aimAngle: this.aimAngle,
      isWalking: this.isWalking,
      walkCycle: this.walkCycle
    });
  }

  async waitForLoaded(): Promise<void> {
    await this.weapon.waitForLoaded();
    console.log(`Enemy loaded: ${this.id}`);
  }
}
