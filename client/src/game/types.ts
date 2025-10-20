import { BoundingBox, AbsoluteBoundingBox } from "./BoundingBox";
import { EntityTransform } from "./EntityTransform";

declare global {
  interface Window {
    __DEBUG_MODE__?: boolean;
  }
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface SVGObjectType {
  name: string;
  svgPath: string;
  size: number;
  holdRelativeX: number;
  holdRelativeY: number;
}

export interface GameObject {
  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  health?: number;
  getAbsoluteBounds(): AbsoluteBoundingBox;
}

export interface Holder extends GameObject {
  getAbsoluteHeldObjectTransform(): EntityTransform;
}

export interface DamageableEntity extends GameObject {
  getCenterOfGravity(): Vector2;
  takeDamage(damage: number): void;
  getEntityLabel(): string;
}

export interface ShootingWeaponType extends SVGObjectType {
  damage: number;
  fireInterval: number;
  bulletSpeed: number;
  bulletSize: number;
  soundEffect?: string;
  /**
   * The relative X coordinate of the hand position along the weapon, as a fraction of weapon length.
   * A value of 0.5 means the hand is at the middle of the weapon.
   * Values range from 0 (base of weapon) to 1 (tip of weapon).
   */
  capacity: number;
  autoFiringType: 'auto' | 'semi-auto';
}

export interface GrenadeType extends SVGObjectType {
  damage: number;
  explosionRadius: number;
  explosionDelay: number;
}

export interface RocketType extends SVGObjectType {
  damage: number;
  explosionRadius: number;
  speed: number;
}

export interface LauncherType extends SVGObjectType {
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
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'ground' | 'platform';
}

export interface TerrainPoint {
  x: number;
  y: number;
}
