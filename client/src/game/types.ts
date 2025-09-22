import { BoundingBox } from "./BoundingBox";
import { EntityTransform } from "./EntityTransform";

export interface Vector2 {
  x: number;
  y: number;
}

export interface GameObject {
  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  health?: number;
}

export interface WeaponType {
  name: string;
  damage: number;
  fireInterval: number;
  bulletSpeed: number;
  bulletSize: number;
  weaponLength: number;
  soundEffect?: string;
  svgPath?: string;
  /**
   * The relative X coordinate of the hand position along the weapon, as a fraction of weapon length.
   * A value of 0.5 means the hand is at the middle of the weapon.
   * Values range from 0 (base of weapon) to 1 (tip of weapon).
   */
  holdRelativeX: number;
  /**
   * The relative Y coordinate of the hand position across the weapon, as a fraction of weapon height.
   * A value of 0.5 means the hand is at the center of the weapon.
   * Values range from 0 (bottom of weapon) to 1 (top of weapon).
   */
  holdRelativeY: number;
  capacity: number;
  autoFiringType: 'auto' | 'semi-auto';
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
