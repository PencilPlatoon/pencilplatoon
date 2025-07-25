import { Vector2, WeaponType, BoundingBox } from "./types";
import { SVGLoader, SVGInfo } from "../util/SVGLoader";
import { Bullet } from "./Bullet";
import { WeaponFigure } from "../figures/WeaponFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";

export class Weapon {
  name: string;
  damage: number;
  fireRate: number;
  bulletSpeed: number;
  bulletColor: string;
  weaponLength: number;
  soundEffect?: string;
  svgPath?: string;
  holdOffset: number;
  boundingBox: BoundingBox;
  svgInfo?: SVGInfo;
  isLoaded: boolean;
  private lastShotTime = 0;
  private _loadPromise: Promise<void>;

  constructor(weaponType: WeaponType) {
    this.name = weaponType.name;
    this.damage = weaponType.damage;
    this.fireRate = weaponType.fireRate;
    this.bulletSpeed = weaponType.bulletSpeed;
    this.bulletColor = weaponType.bulletColor;
    this.weaponLength = weaponType.weaponLength;
    this.soundEffect = weaponType.soundEffect;
    this.svgPath = weaponType.svgPath;
    this.holdOffset = weaponType.holdOffset ?? 0;
    this.isLoaded = false;
    this._loadPromise = Promise.resolve();
    // Compute bounding box
    if (this.svgPath) {
      this.boundingBox = { width: 192, height: 196, relativeReferenceX: 0.5, relativeReferenceY: 0.5 };
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
          const relativeReferenceY = 0.5; // middle vertically
          this.boundingBox = {
            width: svgWidth * scale,
            height: svgHeight * scale,
            relativeReferenceX,
            relativeReferenceY
          };
          this.svgInfo = info;
          this.isLoaded = true;
        } else {
          console.warn(`Weapon SVG failed to load: ${this.svgPath}`);
          // Fallback to basic weapon
          this.boundingBox = {
            width: weaponLength,
            height: 1,
            relativeReferenceX: holdOffset / weaponLength,
            relativeReferenceY: 0.5
          };
          this.isLoaded = true;
        }
      })();
    } else {
      // Basic weapon: line from (0,0) to (weaponLength,0)
      this.boundingBox = {
        width: this.weaponLength,
        height: 1,
        relativeReferenceX: this.holdOffset / this.weaponLength,
        relativeReferenceY: 0.5
      };
      this.isLoaded = true;
      this._loadPromise = Promise.resolve();
    }
  }

  canShoot(): boolean {
    return Date.now() - this.lastShotTime > this.fireRate;
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

  getAbsoluteBounds(referencePoint: Vector2, facing: number) {
    // Get bounding box size in local weapon space
    const w = this.boundingBox.width;
    const h = this.boundingBox.height;
    const refX = w * this.boundingBox.relativeReferenceX;
    const refY = h * (this.boundingBox.relativeReferenceY - 0.5); // center y at 0
    // Four corners in local space (relative to reference point)
    const corners = [
      { x: -refX, y: -h / 2 - refY },           // left-top
      { x: w - refX, y: -h / 2 - refY },        // right-top
      { x: w - refX, y: h / 2 - refY },         // right-bottom
      { x: -refX, y: h / 2 - refY },            // left-bottom
    ];
    // Flip x for facing
    const worldCorners = corners.map(({ x, y }) => ({ x: referencePoint.x + x * facing, y: referencePoint.y + y }));
    // Find axis-aligned bounding box
    const xs = worldCorners.map(c => c.x);
    const ys = worldCorners.map(c => c.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      upperLeft: { x: minX, y: maxY },
      lowerRight: { x: maxX, y: minY }
    };
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
    const absBounds = this.getAbsoluteBounds(position, facing);
    BoundingBoxFigure.render(ctx, absBounds);
  }

  async waitForLoaded(): Promise<void> {
    await this._loadPromise;
    console.log(`Weapon loaded: ${this.name}`);
  }

  static readonly RIFLE: WeaponType = {
    name: "Rifle",
    damage: 25,
    fireRate: 200,
    bulletSpeed: 800,
    bulletColor: "orange",
    weaponLength: 50,
    svgPath: "svg/rifle-a-main-offensive.svg",
    holdOffset: 25
  };

  static readonly MACHINE_GUN: WeaponType = {
    name: "Machine Gun",
    damage: 15,
    fireRate: 100,
    bulletSpeed: 700,
    bulletColor: "yellow",
    weaponLength: 16,
    holdOffset: 8
  };

  static readonly SNIPER: WeaponType = {
    name: "Sniper",
    damage: 50,
    fireRate: 1000,
    bulletSpeed: 1200,
    bulletColor: "red",
    weaponLength: 28,
    holdOffset: 14
  };

  static readonly PISTOL: WeaponType = {
    name: "Pistol",
    damage: 20,
    fireRate: 300,
    bulletSpeed: 600,
    bulletColor: "orange",
    weaponLength: 12,
    holdOffset: 0
  };
}
