export interface Vector2 {
  x: number;
  y: number;
}

export interface BoundingBox {
  width: number;
  height: number;
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
  fireRate: number;
  bulletSpeed: number;
  bulletColor: string;
  weaponLength: number;
  soundEffect?: string;
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

export interface AbsoluteBoundingBox {
  upperLeft: Vector2; // x: min (left), y: min (top)
  lowerRight: Vector2; // x: max (right), y: max (bottom)
}
