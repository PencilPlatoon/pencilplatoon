import { Vector2 } from "./types";
import { Terrain } from "./Terrain";

export class Camera {
  x: number = 0;
  y: number = 0;
  width: number;
  height: number;
  private followSpeed = 2;
  private lookAhead = 100;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  followTarget(target: Vector2, deltaTime: number) {
    // Calculate desired camera position
    const desiredX = target.x - this.width / 2 + this.lookAhead;
    const desiredY = target.y - this.height / 2; // Center player vertically

    // Smoothly move camera towards target
    this.x += (desiredX - this.x) * this.followSpeed * deltaTime;
    this.y += (desiredY - this.y) * this.followSpeed * deltaTime;

    // Clamp camera to world boundaries (adjust for larger level)
    const minY = Terrain.WORLD_TOP - this.height;
    const maxY = Terrain.WORLD_BOTTOM;
    this.x = Math.max(0, Math.min(this.x, 8000 - this.width));
    this.y = Math.max(minY, Math.min(this.y, maxY));
  }

  updateSize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
}
