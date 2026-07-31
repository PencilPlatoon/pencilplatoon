import { Vector2 } from "@/game/types/Vector2";
import { EntityTransform } from "@/game/types/EntityTransform";
import { Terrain } from "@/game/world/Terrain";
import { Physics } from "@/game/systems/Physics";
import { ShootingWeapon } from "@/game/weapons/ShootingWeapon";
import { generateEntityId } from "@/util/random";
import { Projectile } from "./Projectile";

/**
 * A gun lying in the world after its wielder died. It pops off the body, falls
 * under gravity while tumbling, then settles flat along the terrain until the
 * player walks over it and picks it up — keeping whatever ammo was left in the
 * magazine.
 */
export class DroppedWeapon extends Projectile {
  private static readonly POP_UP_SPEED = 250;
  private static readonly POP_SIDE_SPEED = 120;
  private static readonly TUMBLE_SPEED = 6; // rad/s
  static readonly PICKUP_RANGE = 55;

  readonly weapon: ShootingWeapon;
  private grounded = false;
  private tumble: number;

  constructor(weapon: ShootingWeapon, transform: EntityTransform, velocity: Vector2, tumble: number) {
    super(generateEntityId('dropped-weapon'), transform.position.x, transform.position.y, velocity, weapon.bounds);
    this.transform.rotation = transform.rotation;
    this.transform.facing = transform.facing;
    this.weapon = weapon;
    this.tumble = tumble;
  }

  /** Build a dropped weapon that pops off a dying combatant at its hand transform. */
  static fromDeath(weapon: ShootingWeapon, handTransform: EntityTransform): DroppedWeapon {
    const velocity = {
      x: (Math.random() * 2 - 1) * DroppedWeapon.POP_SIDE_SPEED,
      y: DroppedWeapon.POP_UP_SPEED,
    };
    const tumble = (Math.random() * 2 - 1) * DroppedWeapon.TUMBLE_SPEED;
    return new DroppedWeapon(weapon, handTransform, velocity, tumble);
  }

  getEntityLabel(): string {
    return 'dropped-weapon';
  }

  /** Squared-distance gate so pickup detection avoids a sqrt every frame. */
  isWithinPickupRange(point: Vector2): boolean {
    const dx = point.x - this.transform.position.x;
    const dy = point.y - this.transform.position.y;
    return dx * dx + dy * dy <= DroppedWeapon.PICKUP_RANGE * DroppedWeapon.PICKUP_RANGE;
  }

  update(deltaTime: number, terrain: Terrain): void {
    if (!this.active || this.grounded) return;

    Physics.applyGravity(this, deltaTime);
    this.transform.rotation += this.tumble * deltaTime;

    if (this.checkOutOfBounds(0, Terrain.LEVEL_WIDTH, Terrain.WORLD_BOTTOM, Terrain.WORLD_TOP + 100)) return;

    this.settleOnTerrain(terrain);
  }

  private settleOnTerrain(terrain: Terrain): void {
    const terrainHeight = terrain.getHeightAt(this.transform.position.x);
    if (this.transform.position.y > terrainHeight) return;

    // Landed — freeze in whatever orientation it was tumbling through at impact.
    this.transform.position.y = terrainHeight;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.grounded = true;
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.weapon.render(ctx, this.transform, false);
  }
}
