import { DamageableEntity, HoldableObject } from "@/game/types/interfaces";
import { Vector2 } from "@/game/types/Vector2";
import { BoundingBox, AbsoluteBoundingBox } from "@/game/types/BoundingBox";
import { EntityTransform } from "@/game/types/EntityTransform";
import { HumanFigure } from "@/rendering/HumanFigure";
import { HealthBarFigure } from "@/rendering/HealthBarFigure";
import { BoundingBoxFigure } from "@/rendering/BoundingBoxFigure";
import { Terrain } from "@/game/world/Terrain";
import { Physics } from "@/game/systems/Physics";
import { ThrowGrenadeMovement } from "@/game/animation/ThrowGrenadeMovement";

const HEALTHBAR_OFFSET_Y = 20;
const MAX_AIM_ANGLE = Math.PI / 3;

export abstract class Combatant implements DamageableEntity {
  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  health: number;
  previousPosition: Vector2;

  protected aimAngle: number = 0;
  protected walkCycle: number = 0;
  protected isWalking: boolean = false;
  protected isGrounded: boolean = false;
  protected lastX: number = 0;
  protected throwMovement = new ThrowGrenadeMovement();

  abstract get maxHealth(): number;
  abstract getHeldObject(): HoldableObject;
  abstract getEntityLabel(): string;
  abstract getBulletExplosionParameters(): { colors: string[]; particleCount: number; radius: number };

  constructor(id: string, x: number, y: number, health: number) {
    this.id = id;
    this.transform = new EntityTransform({ x, y }, 0, 1);
    this.velocity = { x: 0, y: 1 };
    this.bounds = new BoundingBox(HumanFigure.getWidth(), HumanFigure.getHeight(), { x: 0.5, y: 0.0 });
    this.active = true;
    this.health = health;
    this.previousPosition = { x, y };
    this.lastX = x;
  }

  takeDamage(damage: number): void {
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      this.active = false;
    }
  }

  getAbsoluteBounds(): AbsoluteBoundingBox {
    return this.bounds.getAbsoluteBounds(this.transform.position);
  }

  getCenterOfGravity(): Vector2 {
    return this.bounds.getAbsoluteCenter(this.transform.position);
  }

  private handleTerrainCollision(terrain: Terrain): void {
    this.isGrounded = false;
    const terrainHeight = terrain.getHeightAt(this.transform.position.x);
    if (terrainHeight !== null) {
      if (this.transform.position.y <= terrainHeight && this.velocity.y <= 0) {
        this.transform.position.y = terrainHeight;
        this.velocity.y = 0;
        this.isGrounded = true;
      }
    }
    if (this.transform.position.y < Terrain.WORLD_BOTTOM) {
      this.transform.position.y = Terrain.WORLD_BOTTOM;
      this.velocity.y = 0;
      this.isGrounded = true;
    }
  }

  /**
   * Weapon transform where weapon extends from body pivot point.
   * Weapon line extends from pivot along aimAngle, with grip at offset distance.
   * Offset is selected based on whether weapon has secondary hold (two-handed vs single-handed).
   */
  getWeaponRelTransform(): EntityTransform {
    const holdableObject = this.getHeldObject();
    const hasSecondaryHold = holdableObject.type.secondaryHoldRatioPosition !== null;

    const horizontalOffset = hasSecondaryHold
      ? HumanFigure.WEAPON_HORIZONTAL_OFFSET_TWO_HANDED
      : HumanFigure.WEAPON_HORIZONTAL_OFFSET_SINGLE_HANDED;
    const verticalOffset = hasSecondaryHold
      ? HumanFigure.WEAPON_VERTICAL_OFFSET_TWO_HANDED
      : HumanFigure.WEAPON_VERTICAL_OFFSET_SINGLE_HANDED;

    const pivotX = 0;
    const pivotY = HumanFigure.ARM_Y_OFFSET + verticalOffset;

    const weaponX = pivotX + Math.cos(this.aimAngle) * horizontalOffset;
    const weaponY = pivotY + Math.sin(this.aimAngle) * horizontalOffset;

    return new EntityTransform(
      { x: weaponX, y: weaponY },
      this.aimAngle,
      1
    );
  }

  getWeaponAbsTransform(): EntityTransform {
    return this.transform.applyTransform(this.getWeaponRelTransform());
  }

  /** Whether the combatant is currently holding a grenade (affects hand positioning). */
  protected isHoldingGrenade(): boolean {
    return false;
  }

  getPrimaryHandAbsTransform(): EntityTransform {
    if (this.isHoldingGrenade()) {
      if (this.throwMovement.isInThrowState()) {
        const grenadeRelTransform = this.throwMovement.getGrenadeRelTransform(this.aimAngle);
        return this.transform.applyTransform(grenadeRelTransform);
      }
      const backHandTransform = HumanFigure.getBackHandTransform(0);
      return this.transform.applyTransform(backHandTransform);
    }
    const forwardHandTransform = HumanFigure.getForwardHandTransform(this.aimAngle);
    return this.transform.applyTransform(forwardHandTransform);
  }

  protected getThrowingReleaseAbsTransform(): EntityTransform {
    const relTransform = this.throwMovement.getReleaseRelTransform(this.aimAngle);
    const absTransform = this.transform.applyTransform(relTransform);
    return new EntityTransform(absTransform.position, this.aimAngle, absTransform.facing);
  }

  protected calculateHandPositions(weaponRelTransform: EntityTransform): { forwardHandPosition: Vector2 | null; backHandPosition: Vector2 | null } {
    const holdableObject = this.getHeldObject();
    const primaryHandRelative = HumanFigure.getHandPositionForWeapon(
      weaponRelTransform,
      holdableObject.type,
      holdableObject.bounds.height,
      holdableObject.type.primaryHoldRatioPosition
    );

    const secondaryHandRelative = holdableObject.type.secondaryHoldRatioPosition !== null
      ? HumanFigure.getHandPositionForWeapon(
          weaponRelTransform,
          holdableObject.type,
          holdableObject.bounds.height,
          holdableObject.type.secondaryHoldRatioPosition
        )
      : null;

    if (holdableObject.type.secondaryHoldRatioPosition !== null) {
      return { forwardHandPosition: secondaryHandRelative, backHandPosition: primaryHandRelative };
    }
    return { forwardHandPosition: primaryHandRelative, backHandPosition: null };
  }

  /** Save previous position, update walk animation, apply gravity, clamp x, resolve terrain. */
  protected applyPhysics(deltaTime: number, terrain: Terrain): void {
    this.previousPosition = { x: this.transform.position.x, y: this.transform.position.y };
    this.isWalking = this.velocity.x !== 0;
    this.updateWalkAnimation();
    Physics.applyGravity(this, deltaTime);
    this.transform.position.x = Math.max(50, Math.min(
      this.transform.position.x, terrain.getLevelWidth()));
    this.handleTerrainCollision(terrain);
  }

  /** Compute aim angle from shoulder to target, clamped to ±MAX_AIM_ANGLE. */
  protected computeAimAngle(target: Vector2): number {
    const shoulderY = this.transform.position.y + HumanFigure.ARM_Y_OFFSET;
    const dx = target.x - this.transform.position.x;
    const dy = target.y - shoulderY;
    const rawAngle = Math.atan2(dy, dx * this.transform.facing);
    return Math.max(-MAX_AIM_ANGLE, Math.min(MAX_AIM_ANGLE, rawAngle));
  }

  private updateWalkAnimation(): void {
    if (this.isWalking) {
      this.walkCycle = HumanFigure.updateWalkCycle(this.lastX, this.transform.position.x, this.walkCycle);
    } else {
      this.walkCycle = 0;
    }
    this.lastX = this.transform.position.x;
  }

  protected renderHealthBar(ctx: CanvasRenderingContext2D): void {
    HealthBarFigure.render({
      ctx,
      transform: new EntityTransform({
        x: this.transform.position.x,
        y: this.transform.position.y + HumanFigure.FIGURE_HEIGHT + HEALTHBAR_OFFSET_Y
      }),
      health: this.health,
      maxHealth: this.maxHealth
    });
  }

  protected renderBoundingBox(ctx: CanvasRenderingContext2D): void {
    BoundingBoxFigure.renderPositions(ctx, this.bounds.getBoundingPositions(this.transform.position));
  }
}
