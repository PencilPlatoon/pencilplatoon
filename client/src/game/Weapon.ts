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
      this.boundingBox = { width: 192, height: 196 };
      const weaponLength = this.weaponLength;
      this._loadPromise = (async () => {
        const info = await SVGLoader.get(this.svgPath!);
        if (info) {
          this.boundingBox = info.boundingBox;
          this.svgInfo = info;
          this.isLoaded = true;
        } else {
          console.warn(`Weapon SVG failed to load: ${this.svgPath}`);
          // Fallback to basic weapon
          this.boundingBox = { width: weaponLength, height: 1 };
          this.isLoaded = true;
        }
      })();
    } else {
      // Basic weapon: line from (0,0) to (weaponLength,0)
      this.boundingBox = { width: this.weaponLength, height: 1 };
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

  getAbsoluteBounds({ position, facing, aimAngle }: { position: Vector2; facing: number; aimAngle: number; }) {
    // Compute the base (hand) of the weapon in world coordinates
    const baseX = position.x - Math.cos(aimAngle) * this.holdOffset * facing;
    const baseY = position.y - Math.sin(aimAngle) * this.holdOffset;
    // Get bounding box size in local weapon space
    const w = this.boundingBox.width;
    const h = this.boundingBox.height;
    // Four corners in local space (before transforms)
    const corners = [
      { x: 0, y: -h / 2 },           // left-top
      { x: w, y: -h / 2 },           // right-top
      { x: w, y: h / 2 },            // right-bottom
      { x: 0, y: h / 2 },            // left-bottom
    ];
    // Transform each corner: scale (facing), rotate (aimAngle), then translate to base
    const worldCorners = corners.map(({ x, y }) => {
      // Flip for facing (after rotation)
      const xr = x * Math.cos(aimAngle) - y * Math.sin(aimAngle);
      const yr = x * Math.sin(aimAngle) + y * Math.cos(aimAngle);
      // Now flip x for facing
      const xf = xr * facing;
      // Translate
      return { x: baseX + xf, y: baseY + yr };
    });
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
      holdOffset: this.holdOffset
    });
    const absBounds = this.getAbsoluteBounds({ position, facing, aimAngle });
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
    weaponLength: 60,
    svgPath: "svg/rifle-a-main-offensive.svg",
    holdOffset: 60
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
