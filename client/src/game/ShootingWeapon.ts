import { WeaponType } from "./types";
import { BoundingBox } from "./BoundingBox";
import { SVGLoader, SVGInfo } from "../util/SVGLoader";
import { Bullet } from "./Bullet";
import { WeaponFigure } from "../figures/WeaponFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";
import { EntityTransform } from "./EntityTransform";

export class ShootingWeapon {
  name: string;
  damage: number;
  fireInterval: number;
  bulletSpeed: number;
  bulletSize: number;
  weaponLength: number;
  soundEffect?: string;
  svgPath: string;
  holdRelativeX: number;
  holdRelativeY: number;
  capacity: number;
  autoFiringType: 'auto' | 'semi-auto';
  boundingBox: BoundingBox;
  svgInfo?: SVGInfo;
  isLoaded: boolean;
  bulletsLeft: number;
  private lastShotTime = 0;
  private _loadPromise: Promise<void>;

  constructor(weaponType: WeaponType) {
    this.name = weaponType.name;
    this.damage = weaponType.damage;
    this.fireInterval = weaponType.fireInterval;
    this.bulletSpeed = weaponType.bulletSpeed;
    this.bulletSize = weaponType.bulletSize;
    this.weaponLength = weaponType.weaponLength;
    this.soundEffect = weaponType.soundEffect;
    this.svgPath = weaponType.svgPath;
    this.holdRelativeX = weaponType.holdRelativeX;
    this.holdRelativeY = weaponType.holdRelativeY;
    this.capacity = weaponType.capacity;
    this.autoFiringType = weaponType.autoFiringType;
    this.bulletsLeft = this.capacity;
    this.isLoaded = false;
    this._loadPromise = Promise.resolve();
    // Default to basic weapon
    this.boundingBox = new BoundingBox(
      this.weaponLength,
      1,
      this.holdRelativeX,
      this.holdRelativeY
    );
    if (this.svgPath) {
      const svgPath = this.svgPath;
      const holdRelativeX = this.holdRelativeX;
      const holdRelativeY = this.holdRelativeY;
      this._loadPromise = (async () => {
        const svgInfo = await SVGLoader.get(svgPath);
        if (svgInfo) {
          const { displayWidth, displayHeight } = ShootingWeapon.calculateDisplaySize(weaponType, svgInfo);
          this.boundingBox = new BoundingBox(
            displayWidth,
            displayHeight,
            holdRelativeX,
            holdRelativeY
          );
          this.svgInfo = svgInfo;
          this.isLoaded = true;
        } else {
          console.warn(`ShootingWeapon SVG failed to load: ${svgPath}`);
          // Fall back to basic weapon
          this.isLoaded = true;
        }
      })();
    } else {
      // Basic weapon: line from (0,0) to (weaponLength,0)
      this.isLoaded = true;
      this._loadPromise = Promise.resolve();
    }
  }

  canShoot(newTriggerPress: boolean): boolean {
    const hasAmmo = this.bulletsLeft > 0;
    const fireIntervalPassed = Date.now() - this.lastShotTime > this.fireInterval;

    const canFire = fireIntervalPassed && hasAmmo;
    if (this.autoFiringType === 'auto') {
      return canFire;
    } else { // semi-auto
      return canFire && newTriggerPress;
    }
  }

  shoot(transform: EntityTransform, newTriggerPress: boolean): Bullet | null {
    if (!this.canShoot(newTriggerPress)) return null;
    this.lastShotTime = Date.now();
    this.bulletsLeft--;
    const weaponEndX = transform.position.x + Math.cos(transform.rotation) * this.weaponLength * transform.facing;
    const weaponEndY = transform.position.y + Math.sin(transform.rotation) * this.weaponLength;
    const direction = { x: Math.cos(transform.rotation) * transform.facing, y: Math.sin(transform.rotation) };
    return new Bullet(
      weaponEndX,
      weaponEndY,
      direction,
      this.bulletSpeed,
      this.damage,
      this.bulletSize
    );
  }

  reload(): void {
    this.bulletsLeft = this.capacity;
  }

  getBulletsLeft(): number {
    return this.bulletsLeft;
  }

  getCapacity(): number {
    return this.capacity;
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
    console.log(`ShootingWeapon loaded: ${this.name}`);
  }

  static calculateDisplaySize(weapon: WeaponType, svgInfo: SVGInfo): { displayWidth: number; displayHeight: number } {
    const { boundingBox } = svgInfo;
    const scale = weapon.weaponLength / boundingBox.width;
    
    return {
      displayWidth: boundingBox.width * scale,
      displayHeight: boundingBox.height * scale
    };
  }

  static readonly WEBLEY_REVOLVER: WeaponType = {
    name: "Webley",
    damage: 20,
    fireInterval: 300,
    bulletSpeed: 600,
    bulletSize: 2,
    weaponLength: 20,
    svgPath: "svg/webley.svg",
    holdRelativeX: 0.25,
    holdRelativeY: 0.5,
    capacity: 7,
    autoFiringType: 'auto',
  };

  static readonly RIFLE_A_MAIN_OFFENSIVE: WeaponType = {
    name: "Rifle a main offensive",
    damage: 30,
    fireInterval: 200,
    bulletSpeed: 800,
    bulletSize: 3,
    weaponLength: 50,
    svgPath: "svg/rifle-a-main-offensive.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 30,
    autoFiringType: 'auto',
  };

  static readonly FNAF_BATTLE_RIFLE: WeaponType = {
    name: "FNAF Battle Rifle",
    damage: 25,
    fireInterval: 150,
    bulletSpeed: 800,
    bulletSize: 3,
    weaponLength: 70,
    svgPath: "svg/fnaf-battle-rifle.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 20,
    autoFiringType: 'auto',
  };

  static readonly AK200_ASSAULT_RIFLE: WeaponType = {
    name: "AK-200 Assault Rifle",
    damage: 20,
    fireInterval: 150,
    bulletSpeed: 800,
    bulletSize: 3,
    weaponLength: 70,
    svgPath: "svg/ak-200.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 32,
    autoFiringType: 'auto',
  };

  static readonly M9_JOHNSON: WeaponType = {
    name: "M9 Johnson",
    damage: 45,
    fireInterval: 500,
    bulletSpeed: 800,
    bulletSize: 3,
    weaponLength: 70,
    svgPath: "svg/m9-johnson.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 10,
    autoFiringType: 'auto',
  };

  static readonly M7_CARBINE: WeaponType = {
    name: "M7 Carbine",
    damage: 36,
    fireInterval: 300,
    bulletSpeed: 800,
    bulletSize: 3,
    weaponLength: 70,
    svgPath: "svg/m7-carbine.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 15,
    autoFiringType: 'semi-auto',
  };

  static readonly HARMANN_AND_WOLFFS_BOLT_ACTION_RIFLE: WeaponType = {
    name: "Harmann and Wolffs Bolt Action Rifle",
    damage: 20,
    fireInterval: 750,
    bulletSpeed: 800,
    bulletSize: 3,
    weaponLength: 70,
    svgPath: "svg/harmann-and-wolffs-bolt-action-rifle.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 5,
    autoFiringType: 'semi-auto',
  };

  static readonly M270_BREACHER_SHOTGUN: WeaponType = {
    name: "M270 Breacher",
    damage: 40,
    fireInterval: 1000,
    bulletSpeed: 600,
    bulletSize: 4,
    weaponLength: 50,
    svgPath: "svg/m270-breacher.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 8,
    autoFiringType: 'auto',
  };

  static readonly R_200_SHOTGUN: WeaponType = {
    name: "R-200",
    damage: 20,
    fireInterval: 1000,
    bulletSpeed: 600,
    bulletSize: 4,
    weaponLength: 60,
    svgPath: "svg/r-200.svg",
    holdRelativeX: 0.4,
    holdRelativeY: 0.25,
    capacity: 15,
    autoFiringType: 'auto',
  };

  static readonly MR_27_DRUMBEAT_SHOTGUN: WeaponType = {
    name: "MR-27 Drumbeat",
    damage: 60,
    fireInterval: 1500,
    bulletSpeed: 600,
    bulletSize: 4,
    weaponLength: 80,
    svgPath: "svg/mr-27-drumbeat.svg",
    holdRelativeX: 0.4,
    holdRelativeY: 0.25,
    capacity: 30,
    autoFiringType: 'auto',
  };

  static readonly PTS_27_ANTITANK_GUN: WeaponType = {
    name: "PTS-27 Antitank Gun",
    damage: 60,
    fireInterval: 2000,
    bulletSpeed: 1000,
    bulletSize: 5,
    weaponLength: 70,
    svgPath: "svg/pts-27.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 12,
    autoFiringType: 'auto',
  };

  static readonly BROWNING_MK3_MACHINE_GUN: WeaponType = {
    name: "Browning Mk3",
    damage: 15,
    fireInterval: 100,
    bulletSpeed: 700,
    bulletSize: 3,
    weaponLength: 60,
    svgPath: "svg/browning-mk3.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.25,
    capacity: 100,
    autoFiringType: 'auto',
  };

  static readonly VP_37_SUBMACHINE_GUN: WeaponType = {
    name: "VP-37",
    damage: 7,
    fireInterval: 50,
    bulletSpeed: 700,
    bulletSize: 3,
    weaponLength: 45,
    svgPath: "svg/vp-37.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 20,
    autoFiringType: 'auto',
  };

  static readonly MK_200_SNIPER_RIFLE: WeaponType = {
    name: "MK. 200 Sniper Rifle",
    damage: 36,
    fireInterval: 500,
    bulletSpeed: 1200,
    bulletSize: 3,
    weaponLength: 70,
    svgPath: "svg/mk-200.svg",
    holdRelativeX: 0.35,
    holdRelativeY: 0.5,
    capacity: 6,
    autoFiringType: 'semi-auto',
  };

  static readonly ALL_WEAPONS: WeaponType[] = [
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
