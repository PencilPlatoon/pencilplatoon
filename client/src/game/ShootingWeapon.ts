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

  constructor(weaponType: ShootingWeaponType) {
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

  static readonly WEBLEY_REVOLVER: ShootingWeaponType = {
    name: "Webley",
    damage: 20,
    fireInterval: 300,
    bulletSpeed: 600,
    bulletSize: 2,
    size: 20,
    svgPath: "svg/webley.svg",
    // Pistol: one-handed, only held in primary hand (was forward hand)
    primaryHoldRatioPosition: { x: 0.17, y: 0.52 },
    secondaryHoldRatioPosition: null, // Secondary hand is free
    capacity: 7,
    autoFiringType: 'semi-auto',
  };

  static readonly RIFLE_A_MAIN_OFFENSIVE: ShootingWeaponType = {
    name: "Rifle a main offensive",
    damage: 30,
    fireInterval: 200,
    bulletSpeed: 800,
    bulletSize: 3,
    size: 50,
    svgPath: "svg/rifle-a-main-offensive.svg",
    // Rifle: secondary hand on barrel/foregrip, primary hand on trigger grip
    primaryHoldRatioPosition: { x: 0.32, y: 0.36 },
    secondaryHoldRatioPosition: { x: 0.63, y: 0.35 },
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
    primaryHoldRatioPosition: { x: 0.35, y: 0.38 },
    secondaryHoldRatioPosition: { x: 0.59, y: 0.35 },
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
    primaryHoldRatioPosition: { x: 0.39, y: 0.37 },
    secondaryHoldRatioPosition: { x: 0.64, y: 0.46 },
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
    primaryHoldRatioPosition: { x: 0.36, y: 0.40 },
    secondaryHoldRatioPosition: { x: 0.56, y: 0.39 },
    capacity: 10,
    autoFiringType: 'semi-auto',
  };

  static readonly M7_CARBINE: ShootingWeaponType = {
    name: "M7 Carbine",
    damage: 36,
    fireInterval: 300,
    bulletSpeed: 800,
    bulletSize: 3,
    size: 70,
    svgPath: "svg/m7-carbine.svg",
    primaryHoldRatioPosition: { x: 0.40, y: 0.72 },
    secondaryHoldRatioPosition: { x: 0.66, y: 0.47 },
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
    primaryHoldRatioPosition: { x: 0.45, y: 0.42 },
    secondaryHoldRatioPosition: { x: 0.62, y: 0.44 },
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
    // Shotgun: secondary hand on pump/barrel, primary hand on grip
    primaryHoldRatioPosition: { x: 0.42, y: 0.51 },
    secondaryHoldRatioPosition: { x: 0.72, y: 0.46 },
    capacity: 8,
    autoFiringType: 'semi-auto',
  };

  static readonly R_200_SHOTGUN: ShootingWeaponType = {
    name: "R-200",
    damage: 20,
    fireInterval: 1000,
    bulletSpeed: 600,
    bulletSize: 4,
    size: 60,
    svgPath: "svg/r-200.svg",
    primaryHoldRatioPosition: { x: 0.13, y: 0.42 },
    secondaryHoldRatioPosition: { x: 0.47, y: 0.38 },
    capacity: 15,
    autoFiringType: 'semi-auto',
  };

  static readonly MR_27_DRUMBEAT_SHOTGUN: ShootingWeaponType = {
    name: "MR-27 Drumbeat",
    damage: 60,
    fireInterval: 1500,
    bulletSpeed: 600,
    bulletSize: 4,
    size: 80,
    svgPath: "svg/mr-27-drumbeat.svg",
    primaryHoldRatioPosition: { x: 0.25, y: 0.48 },
    secondaryHoldRatioPosition: { x: 0.43, y: 0.18 },
    capacity: 30,
    autoFiringType: 'semi-auto',
  };

  static readonly PTS_27_ANTITANK_GUN: ShootingWeaponType = {
    name: "PTS-27 Antitank Gun",
    damage: 60,
    fireInterval: 2000,
    bulletSpeed: 1000,
    bulletSize: 5,
    size: 70,
    svgPath: "svg/pts-27.svg",
    primaryHoldRatioPosition: { x: 0.23, y: 0.33 },
    secondaryHoldRatioPosition: { x: 0.42, y: 0.41 },
    capacity: 12,
    autoFiringType: 'semi-auto',
  };

  static readonly BROWNING_MK3_MACHINE_GUN: ShootingWeaponType = {
    name: "Browning Mk3",
    damage: 15,
    fireInterval: 100,
    bulletSpeed: 700,
    bulletSize: 3,
    size: 60,
    svgPath: "svg/browning-mk3.svg",
    // Machine gun: secondary hand on barrel grip, primary hand on trigger
    primaryHoldRatioPosition: { x: 0.29, y: 0.30 },
    secondaryHoldRatioPosition: { x: 0.54, y: 0.44 },
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
    // SMG: compact, closer grips
    primaryHoldRatioPosition: { x: 0.43, y: 0.35 },
    secondaryHoldRatioPosition: { x: 0.64, y: 0.39 },
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
    // Sniper: secondary on foregrip, primary on trigger
    primaryHoldRatioPosition: { x: 0.30, y: 0.47 },
    secondaryHoldRatioPosition: { x: 0.53, y: 0.54 },
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
