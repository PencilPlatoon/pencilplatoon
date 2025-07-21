import { BoundingBox } from "./types";

export class CollisionSystem {
  checkCollision(rect1: BoundingBox, rect2: BoundingBox): boolean {
    return rect1.x < rect2.x + rect2.width &&
           rect1.x + rect1.width > rect2.x &&
           rect1.y < rect2.y + rect2.height &&
           rect1.y + rect1.height > rect2.y;
  }

  checkPointInRect(point: { x: number; y: number }, rect: BoundingBox): boolean {
    return point.x >= rect.x &&
           point.x <= rect.x + rect.width &&
           point.y >= rect.y &&
           point.y <= rect.y + rect.height;
  }

  // Returns true if the line segment from (x1, y1) to (x2, y2) intersects the bounding box
  checkLineIntersectsRect(x1: number, y1: number, x2: number, y2: number, rect: BoundingBox): boolean {
    // Liang-Barsky algorithm for line-rect intersection
    let t0 = 0, t1 = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - rect.x, rect.x + rect.width - x1, y1 - rect.y, rect.y + rect.height - y1];
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
