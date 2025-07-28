import { Vector2 } from "./types";
import { AbsoluteBoundingBox } from "./BoundingBox";

export class CollisionSystem {
  checkCollision(a: AbsoluteBoundingBox, b: AbsoluteBoundingBox): boolean {
    return a.upperLeft.x < b.lowerRight.x &&
           a.lowerRight.x > b.upperLeft.x &&
           a.lowerRight.y < b.upperLeft.y &&
           a.upperLeft.y > b.lowerRight.y;
  }

  checkPointInRect(point: Vector2, rect: AbsoluteBoundingBox): boolean {
    return point.x >= rect.upperLeft.x &&
           point.x <= rect.lowerRight.x &&
           point.y <= rect.upperLeft.y &&
           point.y >= rect.lowerRight.y;
  }

  checkLineIntersectsRect(start: Vector2, end: Vector2, rect: AbsoluteBoundingBox): boolean {
    // Liang-Barsky algorithm for line-rect intersection
    let t0 = 0, t1 = 1;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const left = rect.upperLeft.x;
    const right = rect.lowerRight.x;
    const top = rect.upperLeft.y;
    const bottom = rect.lowerRight.y;
    const p = [-dx, dx, -dy, dy];
    const q = [start.x - left, right - start.x, top - start.y, start.y - bottom];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return false;
      } else {
        const r = q[i] / p[i];
        if (p[i] < 0) {
          if (r > t1) return false;
          if (r > t0) t0 = r;
        } else {
          if (r < t0) return false;
          if (r < t1) t1 = r;
        }
      }
    }
    return true;
  }
}
