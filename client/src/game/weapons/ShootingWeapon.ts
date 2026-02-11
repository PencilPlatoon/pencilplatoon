import { ShootingWeaponType, HoldableObject } from "@/game/types/interfaces";
import { Vector2 } from "@/game/types/Vector2";
import { BoundingBox } from "@/game/types/BoundingBox";
import { SVGInfo } from "@/util/SVGLoader";
import { loadSVGAndCreateBounds } from "@/util/SVGAssetLoader";
import { Bullet } from "@/game/entities/Bullet";
import { ShootingWeaponFigure } from "@/rendering/ShootingWeaponFigure";
import { BoundingBoxFigure } from "@/rendering/BoundingBoxFigure";
import { EntityTransform } from "@/game/types/EntityTransform";

export class ShootingWeapon implements HoldableObject {
  type: ShootingWeaponType;
  boundingBox: BoundingBox;
  svgInfo?: SVGInfo;
  isLoaded: boolean;
  bulletsLeft: number;
  private lastShotTime = 0;
  private _loadPromise: Promise<void>;
  private getNow: () => number;

  constructor(weaponType: ShootingWeaponType, getNow: () => number = Date.now) {
    this.getNow = getNow;
    this.type = weaponType;
    this.bulletsLeft = weaponType.capacity;
    this.isLoaded = false;
    
    // Default to basic weapon
    this.boundingBox = new BoundingBox(
      weaponType.size,
      1,
      weaponType.primaryHoldRatioPosition
    );
    
    this._loadPromise = loadSVGAndCreateBounds(weaponType, 1, weaponType.primaryHoldRatioPosition).then(({ bounds, svgInfo }) => {
      this.boundingBox = bounds;
      this.svgInfo = svgInfo;
      this.isLoaded = true;
    });
  }
  
  get bounds(): BoundingBox {
    return this.boundingBox;
  }

  canShoot(newTriggerPress: boolean): boolean {
    const hasAmmo = this.bulletsLeft > 0;
    const fireIntervalPassed = this.getNow() - this.lastShotTime > this.type.fireInterval;

    const canFire = fireIntervalPassed && hasAmmo;
    if (this.type.autoFiringType === 'auto') {
      return canFire;
    } else { // semi-auto
      return canFire && newTriggerPress;
    }
  }

  getMuzzleTransform(weaponTransform: EntityTransform): EntityTransform {
    const grip = this.type.primaryHoldRatioPosition;
    const muzzle = this.type.muzzleRatioPosition;
    const dx = this.boundingBox.width * (muzzle.x - grip.x);
    const dy = this.boundingBox.height * (muzzle.y - grip.y);
    const cos = Math.cos(weaponTransform.rotation);
    const sin = Math.sin(weaponTransform.rotation);
    return new EntityTransform(
      {
        x: weaponTransform.position.x + (cos * dx - sin * dy) * weaponTransform.facing,
        y: weaponTransform.position.y + (sin * dx + cos * dy)
      },
      weaponTransform.rotation, weaponTransform.facing
    );
  }

  shoot(transform: EntityTransform, newTriggerPress: boolean): Bullet[] {
    if (!this.canShoot(newTriggerPress)) return [];
    this.lastShotTime = this.getNow();
    this.bulletsLeft--;
    const muzzle = this.getMuzzleTransform(transform);
    const baseAngle = Math.atan2(
      Math.sin(transform.rotation),
      Math.cos(transform.rotation) * transform.facing
    );

    const pelletCount = this.type.pelletCount ?? 1;
    const spreadAngle = this.type.spreadAngle ?? 0;

    return this.createPellets(muzzle, baseAngle, pelletCount, spreadAngle);
  }

  private createPellets(
    muzzle: EntityTransform,
    baseAngle: number,
    pelletCount: number,
    spreadAngle: number
  ): Bullet[] {
    const isPellet = pelletCount > 1;
    const damagePerPellet = isPellet ? this.type.damage / pelletCount : this.type.damage;

    if (!isPellet) {
      const direction = { x: Math.cos(baseAngle), y: Math.sin(baseAngle) };
      return [new Bullet(
        muzzle.position.x, muzzle.position.y,
        direction, this.type.bulletSpeed, damagePerPellet, this.type.bulletSize
      )];
    }

    const bullets: Bullet[] = [];
    for (let i = 0; i < pelletCount; i++) {
      const offset = spreadAngle * ((i / (pelletCount - 1)) - 0.5);
      const angle = baseAngle + offset;
      const direction = { x: Math.cos(angle), y: Math.sin(angle) };
      bullets.push(new Bullet(
        muzzle.position.x, muzzle.position.y,
        direction, this.type.bulletSpeed, damagePerPellet, this.type.bulletSize,
        true, this.type.damageDropoff
      ));
    }
    return bullets;
  }

  reload(): void {
    this.bulletsLeft = this.type.capacity;
  }

  getBulletsLeft(): number {
    return this.bulletsLeft;
  }

  getCapacity(): number {
    return this.type.capacity;
  }

  render(ctx: CanvasRenderingContext2D, transform: EntityTransform, showAimLine: boolean = true) {
    ShootingWeaponFigure.render({
      ctx,
      transform,
      weapon: this,
      showAimLine,
      svgInfo: this.svgInfo,
      boundingBox: this.boundingBox
    });
    BoundingBoxFigure.renderPositions(ctx, this.boundingBox.getRotatedBoundingPositions(transform));
  }

  async waitForLoaded(): Promise<void> {
    await this._loadPromise;
    console.log(`ShootingWeapon loaded: ${this.type.name}`);
  }

  updatePrimaryHoldRatioPosition(ratioPosition: Vector2): void {
    this.type.primaryHoldRatioPosition = ratioPosition;
    this.boundingBox.refRatioPosition = ratioPosition;
  }

  updateSecondaryHoldRatioPosition(ratioPosition: Vector2): void {
    this.type.secondaryHoldRatioPosition = ratioPosition;
  }

  updateMuzzleRatioPosition(ratioPosition: Vector2): void {
    this.type.muzzleRatioPosition = ratioPosition;
  }
}
