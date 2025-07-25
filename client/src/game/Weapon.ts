import { Vector2, WeaponType } from "./types";
import { Bullet } from "./Bullet";
import { WeaponFigure } from "../figures/WeaponFigure";

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
  private lastShotTime = 0;

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
      svgPath: this.svgPath,
      holdOffset: this.holdOffset
    });
  }

  static readonly RIFLE: WeaponType = {
    name: "Rifle",
    damage: 25,
    fireRate: 200,
    bulletSpeed: 800,
    bulletColor: "orange",
    weaponLength: 60,
    svgPath: "/svg/rifle-a-main-offensive.svg",
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
