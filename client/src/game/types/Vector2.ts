export interface Vector2 {
  x: number;
  y: number;
}

// Vector2 utility functions
export namespace Vector2Utils {
  export function subtract(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  export function add(a: Vector2, b: Vector2): Vector2 {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  export function multiply(a: Vector2, scalar: number): Vector2 {
    return { x: a.x * scalar, y: a.y * scalar };
  }

  export function divide(a: Vector2, scalar: number): Vector2 {
    return { x: a.x / scalar, y: a.y / scalar };
  }

  export function magnitude(v: Vector2): number {
    return Math.sqrt(v.x * v.x + v.y * v.y);
  }

  export function normalize(v: Vector2): Vector2 {
    const mag = magnitude(v);
    return mag === 0 ? v : divide(v, mag);
  }

  export function clampToRatioBounds(v: Vector2): Vector2 {
    return {
      x: Math.max(0, Math.min(1, v.x)),
      y: Math.max(0, Math.min(1, v.y))
    };
  }

  export function rotate(v: Vector2, angle: number): Vector2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: v.x * cos - v.y * sin,
      y: v.x * sin + v.y * cos
    };
  }
}
