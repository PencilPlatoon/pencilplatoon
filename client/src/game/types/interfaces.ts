import { BoundingBox, AbsoluteBoundingBox } from "./BoundingBox";
import { EntityTransform } from "./EntityTransform";
import { Vector2 } from "./Vector2";

declare global {
  interface Window {
    __DEBUG_MODE__?: boolean;
  }
}

export interface SVGObjectType {
  name: string;
  svgPath: string;
  size: number;
}

export interface GameObject {
  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  health?: number;
  previousPosition: Vector2;
  getAbsoluteBounds(): AbsoluteBoundingBox;
}

export interface Holder extends GameObject {
  getPrimaryHandAbsTransform(): EntityTransform;
}

export interface DamageableEntity extends GameObject {
  getCenterOfGravity(): Vector2;
  takeDamage(damage: number): void;
  getEntityLabel(): string;
  getBulletExplosionParameters(): { colors: string[], particleCount: number, radius: number };
}

export interface ExplosionParameters {
  position: Vector2;
  radius: number;
  colors: string[];
  particleCount: number;
}

export interface ExplodingEntity extends GameObject {
  explosionRadius: number;
  explosionDamage: number;
  getEntityLabel(): string;
  getExplosionParameters(): ExplosionParameters;
}

export interface HoldableObjectType extends SVGObjectType {
  /**
   * Primary hand hold position (grip/trigger area) as fraction of weapon dimensions (0-1).
   * x: 0 = base of weapon, 1 = tip of weapon
   * y: 0.5 = center of weapon
   * Required for all weapons.
   */
  primaryHoldRatioPosition: Vector2;
  /**
   * Secondary hand hold position (barrel/foregrip area) as fraction of weapon dimensions (0-1).
   * x: 0 = base of weapon, 1 = tip of weapon
   * y: 0.5 = center of weapon
   * null = secondary hand does not hold weapon (e.g., pistols)
   */
  secondaryHoldRatioPosition: Vector2 | null;
}

export interface DamageDropoff {
  effectiveRange: number;
  minDamageRatio: number;
}

export interface ShootingWeaponType extends HoldableObjectType {
  damage: number;
  fireInterval: number;
  bulletSpeed: number;
  bulletSize: number;
  soundEffect?: string;
  capacity: number;
  autoFiringType: 'auto' | 'semi-auto';
  pelletCount?: number;
  spreadAngle?: number;
  damageDropoff?: DamageDropoff;
}

export interface GrenadeType extends HoldableObjectType {
  damage: number;
  explosionRadius: number;
  explosionDelay: number;
}

export interface RocketType extends SVGObjectType {
  damage: number;
  explosionRadius: number;
  speed: number;
}

export interface LauncherType extends HoldableObjectType {
  rocketType: string; // matches a RocketType definition
  capacity: number;
  reloadAnimationDuration: number; // Player reads this and manages reload cycle
}

export interface Particle {
  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  color: string;
  life: number;
  maxLife: number;
  size: number;
}

export interface TerrainSegment {
  position: Vector2;
  width: number;
  height: number;
  type: 'ground' | 'platform';
}

export interface HoldableObject {
  type: HoldableObjectType;
  bounds: BoundingBox;
  render(ctx: CanvasRenderingContext2D, transform: EntityTransform): void;
  updatePrimaryHoldRatioPosition(ratioPosition: Vector2): void;
  updateSecondaryHoldRatioPosition(ratioPosition: Vector2): void;
}
