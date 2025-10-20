import { ShootingWeaponType } from "./types";
import { BoundingBox } from "./BoundingBox";
import { SVGInfo } from "../util/SVGLoader";
import { loadSVGAndCreateBounds } from "../util/SVGAssetLoader";
import { Bullet } from "./Bullet";
import { WeaponFigure } from "../figures/WeaponFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";
import { EntityTransform } from "./EntityTransform";

export class ShootingWeapon {
  type: ShootingWeaponType;
  boundingBox: BoundingBox;
  svgInfo?: SVGInfo;
  isLoaded: boolean;
  bulletsLeft: number;
  private lastShotTime = 0;
  private _loadPromise: Promise<void>;

  constructor(weaponType: ShootingWeaponType) {
    this.type = weaponType;
    this.bulletsLeft = weaponType.capacity;
    this.isLoaded = false;
    
    // Default to basic weapon
    this.boundingBox = new BoundingBox(
      weaponType.size,
      1,
      weaponType.holdRelativeX,
      weaponType.holdRelativeY
    );
    
    this._loadPromise = loadSVGAndCreateBounds(weaponType, 1).then(({ bounds, svgInfo }) => {
      this.boundingBox = bounds;
      this.svgInfo = svgInfo;
      this.isLoaded = true;
    });
  }

  canShoot(newTriggerPress: boolean): boolean {
    const hasAmmo = this.bulletsLeft > 0;
    const fireIntervalPassed = Date.now() - this.lastShotTime > this.type.fireInterval;

    const canFire = fireIntervalPassed && hasAmmo;
    if (this.type.autoFiringType === 'auto') {
      return canFire;
    } else { // semi-auto
      return canFire && newTriggerPress;
    }
  }

  shoot(transform: EntityTransform, newTriggerPress: boolean): Bullet | null {
    if (!this.canShoot(newTriggerPress)) return null;
    this.lastShotTime = Date.now();
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

  render({
    ctx,
    transform,
    showAimLine = false
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    showAimLine?: boolean;
  }) {
    WeaponFigure.render({
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

  static readonly WEBLEY_REVOLVER: ShootingWeaponType = {
    name: "Webley",
    damage: 20,
    fireInterval: 300,
    bulletSpeed: 600,
    bulletSize: 2,
    size: 20,
    svgPath: "svg/webley.svg",
    holdRelativeX: 0.25,
    holdRelativeY: 0.5,
    capacity: 7,
    autoFiringType: 'auto',
  };

  static readonly RIFLE_A_MAIN_OFFENSIVE: ShootingWeaponType = {
    name: "Rifle a main offensive",
    damage: 30,
    fireInterval: 200,
    bulletSpeed: 800,
    bulletSize: 3,
    size: 50,
    svgPath: "svg/rifle-a-main-offensive.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 30,
    autoFiringType: 'auto',
  };

  static readonly FNAF_BATTLE_RIFLE: ShootingWeaponType = {
    name: "FNAF Battle Rifle",
    damage: 25,
    fireInterval: 150,
    bulletSpeed: 800,
    bulletSize: 3,
    size: 70,
    svgPath: "svg/fnaf-battle-rifle.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 20,
    autoFiringType: 'auto',
  };

  static readonly AK200_ASSAULT_RIFLE: ShootingWeaponType = {
    name: "AK-200 Assault Rifle",
    damage: 20,
    fireInterval: 150,
    bulletSpeed: 800,
    bulletSize: 3,
    size: 70,
    svgPath: "svg/ak-200.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 32,
    autoFiringType: 'auto',
  };

  static readonly M9_JOHNSON: ShootingWeaponType = {
    name: "M9 Johnson",
    damage: 45,
    fireInterval: 500,
    bulletSpeed: 800,
    bulletSize: 3,
    size: 70,
    svgPath: "svg/m9-johnson.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 10,
    autoFiringType: 'auto',
  };

  static readonly M7_CARBINE: ShootingWeaponType = {
    name: "M7 Carbine",
    damage: 36,
    fireInterval: 300,
    bulletSpeed: 800,
    bulletSize: 3,
    size: 70,
    svgPath: "svg/m7-carbine.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 15,
    autoFiringType: 'semi-auto',
  };

  static readonly HARMANN_AND_WOLFFS_BOLT_ACTION_RIFLE: ShootingWeaponType = {
    name: "Harmann and Wolffs Bolt Action Rifle",
    damage: 20,
    fireInterval: 750,
    bulletSpeed: 800,
    bulletSize: 3,
    size: 70,
    svgPath: "svg/harmann-and-wolffs-bolt-action-rifle.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 5,
    autoFiringType: 'semi-auto',
  };

  static readonly M270_BREACHER_SHOTGUN: ShootingWeaponType = {
    name: "M270 Breacher",
    damage: 40,
    fireInterval: 1000,
    bulletSpeed: 600,
    bulletSize: 4,
    size: 50,
    svgPath: "svg/m270-breacher.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 8,
    autoFiringType: 'auto',
  };

  static readonly R_200_SHOTGUN: ShootingWeaponType = {
    name: "R-200",
    damage: 20,
    fireInterval: 1000,
    bulletSpeed: 600,
    bulletSize: 4,
    size: 60,
    svgPath: "svg/r-200.svg",
    holdRelativeX: 0.4,
    holdRelativeY: 0.25,
    capacity: 15,
    autoFiringType: 'auto',
  };

  static readonly MR_27_DRUMBEAT_SHOTGUN: ShootingWeaponType = {
    name: "MR-27 Drumbeat",
    damage: 60,
    fireInterval: 1500,
    bulletSpeed: 600,
    bulletSize: 4,
    size: 80,
    svgPath: "svg/mr-27-drumbeat.svg",
    holdRelativeX: 0.4,
    holdRelativeY: 0.25,
    capacity: 30,
    autoFiringType: 'auto',
  };

  static readonly PTS_27_ANTITANK_GUN: ShootingWeaponType = {
    name: "PTS-27 Antitank Gun",
    damage: 60,
    fireInterval: 2000,
    bulletSpeed: 1000,
    bulletSize: 5,
    size: 70,
    svgPath: "svg/pts-27.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 12,
    autoFiringType: 'auto',
  };

  static readonly BROWNING_MK3_MACHINE_GUN: ShootingWeaponType = {
    name: "Browning Mk3",
    damage: 15,
    fireInterval: 100,
    bulletSpeed: 700,
    bulletSize: 3,
    size: 60,
    svgPath: "svg/browning-mk3.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.25,
    capacity: 100,
    autoFiringType: 'auto',
  };

  static readonly VP_37_SUBMACHINE_GUN: ShootingWeaponType = {
    name: "VP-37",
    damage: 7,
    fireInterval: 50,
    bulletSpeed: 700,
    bulletSize: 3,
    size: 45,
    svgPath: "svg/vp-37.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 20,
    autoFiringType: 'auto',
  };

  static readonly MK_200_SNIPER_RIFLE: ShootingWeaponType = {
    name: "MK. 200 Sniper Rifle",
    damage: 36,
    fireInterval: 500,
    bulletSpeed: 1200,
    bulletSize: 3,
    size: 70,
    svgPath: "svg/mk-200.svg",
    holdRelativeX: 0.35,
    holdRelativeY: 0.5,
    capacity: 6,
    autoFiringType: 'semi-auto',
  };

  static readonly ALL_WEAPONS: ShootingWeaponType[] = [
    ShootingWeapon.WEBLEY_REVOLVER,
    ShootingWeapon.RIFLE_A_MAIN_OFFENSIVE,
    ShootingWeapon.FNAF_BATTLE_RIFLE,
    ShootingWeapon.AK200_ASSAULT_RIFLE,
    ShootingWeapon.M9_JOHNSON,
    ShootingWeapon.M7_CARBINE,
    ShootingWeapon.HARMANN_AND_WOLFFS_BOLT_ACTION_RIFLE,
    ShootingWeapon.M270_BREACHER_SHOTGUN,
    ShootingWeapon.R_200_SHOTGUN,
    ShootingWeapon.MR_27_DRUMBEAT_SHOTGUN,
    ShootingWeapon.PTS_27_ANTITANK_GUN,
    ShootingWeapon.BROWNING_MK3_MACHINE_GUN,
    ShootingWeapon.VP_37_SUBMACHINE_GUN,
    ShootingWeapon.MK_200_SNIPER_RIFLE,
  ];
}
