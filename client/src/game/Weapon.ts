import { WeaponType } from "./types";
import { BoundingBox } from "./BoundingBox";
import { SVGLoader, SVGInfo } from "../util/SVGLoader";
import { Bullet } from "./Bullet";
import { WeaponFigure } from "../figures/WeaponFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";
import { EntityTransform } from "./EntityTransform";

export class Weapon {
  name: string;
  damage: number;
  fireInterval: number;
  bulletSpeed: number;
  bulletColor: string;
  weaponLength: number;
  soundEffect?: string;
  svgPath?: string;
  holdRelativeX: number;
  holdRelativeY: number;
  capacity: number;
  boundingBox: BoundingBox;
  svgInfo?: SVGInfo;
  isLoaded: boolean;
  private lastShotTime = 0;
  private _loadPromise: Promise<void>;

  constructor(weaponType: WeaponType) {
    this.name = weaponType.name;
    this.damage = weaponType.damage;
    this.fireInterval = weaponType.fireInterval;
    this.bulletSpeed = weaponType.bulletSpeed;
    this.bulletColor = weaponType.bulletColor;
    this.weaponLength = weaponType.weaponLength;
    this.soundEffect = weaponType.soundEffect;
    this.svgPath = weaponType.svgPath;
    this.holdRelativeX = weaponType.holdRelativeX;
    this.holdRelativeY = weaponType.holdRelativeY;
    this.capacity = weaponType.capacity ?? 0;
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
      const holdRelativeX = this.holdRelativeX;
      const holdRelativeY = this.holdRelativeY;
      const weaponLength = this.weaponLength;
      this._loadPromise = (async () => {
        const info = await SVGLoader.get(this.svgPath!);
        if (info) {
          // Scale bounding box to match weaponLength (like WeaponFigure)
          const svgWidth = info.boundingBox.width;
          const svgHeight = info.boundingBox.height;
          const scale = weaponLength / svgWidth;
          this.boundingBox = new BoundingBox(
            svgWidth * scale,
            svgHeight * scale,
            holdRelativeX,
            holdRelativeY
          );
          this.svgInfo = info;
          this.isLoaded = true;
        } else {
          console.warn(`Weapon SVG failed to load: ${this.svgPath}`);
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

  canShoot(): boolean {
    return Date.now() - this.lastShotTime > this.fireInterval;
  }

  shoot(transform: EntityTransform): Bullet | null {
    if (!this.canShoot()) return null;
    this.lastShotTime = Date.now();
    const weaponEndX = transform.position.x + Math.cos(transform.rotation) * this.weaponLength * transform.facing;
    const weaponEndY = transform.position.y + Math.sin(transform.rotation) * this.weaponLength;
    const direction = { x: Math.cos(transform.rotation) * transform.facing, y: Math.sin(transform.rotation) };
    return new Bullet(
      weaponEndX,
      weaponEndY,
      direction,
      this.bulletSpeed,
      this.damage,
      this.bulletColor
    );
  }

  render({
    ctx,
    transform,
    showAimLine = false,
    aimLineLength = 100
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    showAimLine?: boolean;
    aimLineLength?: number;
  }) {
    WeaponFigure.render({
      ctx,
      transform,
      weapon: this,
      showAimLine,
      aimLineLength,
      svgInfo: this.svgInfo,
      boundingBox: this.boundingBox
    });
    BoundingBoxFigure.renderPositions(ctx, this.boundingBox.getRotatedBoundingPositions(transform));
  }

  async waitForLoaded(): Promise<void> {
    await this._loadPromise;
    console.log(`Weapon loaded: ${this.name}`);
  }

  static readonly WEBLEY_REVOLVER: WeaponType = {
    name: "Webley",
    damage: 20,
    fireInterval: 300,
    bulletSpeed: 600,
    bulletColor: "orange",
    weaponLength: 20,
    svgPath: "svg/webley.svg",
    holdRelativeX: 0.25,
    holdRelativeY: 0.5,
    capacity: 7,
  };

  static readonly RIFLE_A_MAIN_OFFENSIVE: WeaponType = {
    name: "Rifle a main offensive",
    damage: 25,
    fireInterval: 200,
    bulletSpeed: 800,
    bulletColor: "orange",
    weaponLength: 50,
    svgPath: "svg/rifle-a-main-offensive.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 30,
  };

  static readonly FNAF_BATTLE_RIFLE: WeaponType = {
    name: "FNAF Battle Rifle",
    damage: 25,
    fireInterval: 200,
    bulletSpeed: 800,
    bulletColor: "orange",
    weaponLength: 70,
    svgPath: "svg/fnaf-battle-rifle.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 20,
  };

  static readonly M270_BREACHER_SHOTGUN: WeaponType = {
    name: "M270 Breacher",
    damage: 20,
    fireInterval: 1000,
    bulletSpeed: 600,
    bulletColor: "orange",
    weaponLength: 50,
    svgPath: "svg/m270-breacher.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 8,
  };

  static readonly PTS_27_ANTITANK_GUN: WeaponType = {
    name: "PTS-27 Antitank Gun",
    damage: 60,
    fireInterval: 2000,
    bulletSpeed: 1000,
    bulletColor: "orange",
    weaponLength: 70,
    svgPath: "svg/pts-27.svg",
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 12,
  };

  static readonly MACHINE_GUN: WeaponType = {
    name: "Machine Gun",
    damage: 15,
    fireInterval: 100,
    bulletSpeed: 700,
    bulletColor: "yellow",
    weaponLength: 16,
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 100,
  };

  static readonly SNIPER: WeaponType = {
    name: "Sniper",
    damage: 50,
    fireInterval: 1000,
    bulletSpeed: 1200,
    bulletColor: "red",
    weaponLength: 28,
    holdRelativeX: 0.5,
    holdRelativeY: 0.5,
    capacity: 5,
  };
}
