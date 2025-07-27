import { BoundingBox } from "./BoundingBox";

export interface Vector2 {
  x: number;
  y: number;
}

export interface GameObject {
  id: string;
  position: Vector2;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  health?: number;
  maxHealth?: number;
}

export interface WeaponType {
  name: string;
  damage: number;
  fireInterval: number;
  bulletSpeed: number;
  bulletColor: string;
  weaponLength: number;
  soundEffect?: string;
  svgPath?: string;
  /**
   * The offset (in weapon SVG or line coordinates) from the weapon's base to the hand position.
   * A value of 0 means the weapon base is aligned with the hand (current behavior).
   * Positive values move the weapon forward, negative values move it backward.
   */
  holdOffset?: number;
}

export interface Particle {
  id: string;
  position: Vector2;
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
