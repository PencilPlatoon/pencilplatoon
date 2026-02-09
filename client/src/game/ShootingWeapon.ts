import { ShootingWeaponType, HoldableObject } from "./types";
import { Vector2 } from "./Vector2";
import { BoundingBox } from "./BoundingBox";
import { SVGInfo } from "../util/SVGLoader";
import { loadSVGAndCreateBounds } from "../util/SVGAssetLoader";
import { Bullet } from "./Bullet";
import { ShootingWeaponFigure } from "../figures/ShootingWeaponFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";
import { EntityTransform } from "./EntityTransform";

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

  shoot(transform: EntityTransform, newTriggerPress: boolean): Bullet | null {
    if (!this.canShoot(newTriggerPress)) return null;
    this.lastShotTime = this.getNow();
    this.bulletsLeft--;
    const weaponEndX = transform.position.x + Math.cos(transform.rotation) * this.type.size * transform.facing;
    const weaponEndY = transform.position.y + Math.sin(transform.rotation) * this.type.size;
    const direction = { x: Math.cos(transform.rotation) * transform.facing, y: Math.sin(transform.rotation) };
    return new Bullet(
      weaponEndX,
      weaponEndY,
      direction,
      this.type.bulletSpeed,
      this.type.damage,
      this.type.bulletSize
    );
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
}
