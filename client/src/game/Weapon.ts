import { Vector2, WeaponType } from "./types";
import { BoundingBox } from "./BoundingBox";
import { SVGLoader, SVGInfo } from "../util/SVGLoader";
import { Bullet } from "./Bullet";
import { WeaponFigure } from "../figures/WeaponFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";

export class Weapon {
  name: string;
  damage: number;
  fireInterval: number;
  bulletSpeed: number;
  bulletColor: string;
  weaponLength: number;
  soundEffect?: string;
  svgPath?: string;
  holdOffset: number;
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
    this.holdOffset = weaponType.holdOffset ?? 0;
    this.capacity = weaponType.capacity ?? 0;
    this.isLoaded = false;
    this._loadPromise = Promise.resolve();
    // Compute bounding box
    if (this.svgPath) {
      this.boundingBox = new BoundingBox(192, 196, 0.5, 0.5);
      const weaponLength = this.weaponLength;
      const holdOffset = this.holdOffset;
      this._loadPromise = (async () => {
        const info = await SVGLoader.get(this.svgPath!);
        if (info) {
          // Scale bounding box to match weaponLength (like WeaponFigure)
          const svgWidth = info.boundingBox.width;
          const svgHeight = info.boundingBox.height;
          const scale = weaponLength / svgWidth;
          // Reference point as a fraction of weaponLength
          const relativeReferenceX = (holdOffset ?? weaponLength / 2) / weaponLength;
          const relativeReferenceY = 0.5; // base of weapon (where it's held)
          this.boundingBox = new BoundingBox(
            svgWidth * scale,
            svgHeight * scale,
            relativeReferenceX,
            relativeReferenceY
          );
          this.svgInfo = info;
          this.isLoaded = true;
        } else {
          console.warn(`Weapon SVG failed to load: ${this.svgPath}`);
          // Fallback to basic weapon
          this.boundingBox = new BoundingBox(
            weaponLength,
            1,
            holdOffset / weaponLength,
            0.5
          );
          this.isLoaded = true;
        }
      })();
    } else {
      // Basic weapon: line from (0,0) to (weaponLength,0)
      this.boundingBox = new BoundingBox(
        this.weaponLength,
        1,
        this.holdOffset / this.weaponLength,
        0.5
      );
      this.isLoaded = true;
      this._loadPromise = Promise.resolve();
    }
  }

  canShoot(): boolean {
    return Date.now() - this.lastShotTime > this.fireInterval;
  }

  shoot(params: {
    position: Vector2;
    facing: number;
    aimAngle: number;
  }): Bullet | null {
    if (!this.canShoot()) return null;
    this.lastShotTime = Date.now();
    const { position, facing, aimAngle } = params;
    const weaponEndX = position.x + Math.cos(aimAngle) * this.weaponLength * facing;
    const weaponEndY = position.y + Math.sin(aimAngle) * this.weaponLength;
    const direction = { x: Math.cos(aimAngle) * facing, y: Math.sin(aimAngle) };
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
    position,
    facing,
    aimAngle,
    showAimLine = false,
    aimLineLength = 100
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2;
    facing: number;
    aimAngle: number;
    showAimLine?: boolean;
    aimLineLength?: number;
  }) {
    WeaponFigure.render({
      ctx,
      position,
      facing,
      aimAngle,
      weapon: this,
      showAimLine,
      aimLineLength,
      svgInfo: this.svgInfo,
      boundingBox: this.boundingBox
    });
    BoundingBoxFigure.renderPositions(ctx, this.boundingBox.getRotatedBoundingPositions(position, facing, aimAngle));
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
    holdOffset: 5,
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
    holdOffset: 25,
    capacity: 30,
  };

  static readonly M270_BREACHER_SHOTGUN: WeaponType = {
    name: "M270 Breacher",
    damage: 20,
    fireInterval: 1000,
    bulletSpeed: 600,
    bulletColor: "orange",
    weaponLength: 50,
    svgPath: "svg/m270-breacher.svg",
    holdOffset: 25,
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
    holdOffset: 35,
    capacity: 12,
  };

  static readonly MACHINE_GUN: WeaponType = {
    name: "Machine Gun",
    damage: 15,
    fireInterval: 100,
    bulletSpeed: 700,
    bulletColor: "yellow",
    weaponLength: 16,
    holdOffset: 8,
    capacity: 100,
  };

  static readonly SNIPER: WeaponType = {
    name: "Sniper",
    damage: 50,
    fireInterval: 1000,
    bulletSpeed: 1200,
    bulletColor: "red",
    weaponLength: 28,
    holdOffset: 14,
    capacity: 5,
  };
}
