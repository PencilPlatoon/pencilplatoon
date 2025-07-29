import { Vector2 } from "./types";
import { Terrain } from "./Terrain";

export class Camera {
  bottomLeftWorldX: number = 0;
  bottomLeftWorldY: number = 0;
  width: number;
  height: number;
  private followSpeed = 2;
  private lookAhead = 100;
  private terrain: Terrain | null = null;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    console.log("Camera constructor", this.width, this.height);
  }

  setTerrain(terrain: Terrain) {
    this.terrain = terrain;
  }

  followTarget(target: Vector2, deltaTime: number) {
    // Calculate desired camera position (bottom-left of viewport)
    const desiredBottomLeftX = target.x - this.width / 2 + this.lookAhead;
    
    // Check if world height fits within canvas height
    const worldHeight = Terrain.WORLD_TOP - Terrain.WORLD_BOTTOM;
    
    let desiredBottomLeftY;
    if (worldHeight < this.height) {
      // World fits within canvas - position world at bottom of screen
      desiredBottomLeftY = Terrain.WORLD_BOTTOM;
    } else {
      // World doesn't fit - try to center on player
      desiredBottomLeftY = target.y - this.height / 2;
      
      // Check terrain height at multiple points to ensure proper camera positioning
      const terrainAtPlayer = this.getTerrainHeightAt(target.x);
      const terrainAtLeft = this.getTerrainHeightAt(target.x - this.width / 4);
      const terrainAtRight = this.getTerrainHeightAt(target.x + this.width / 4);
      
      // Find the highest terrain point in the camera view
      const maxTerrainHeight = Math.max(terrainAtPlayer, terrainAtLeft, terrainAtRight);
      
      // If terrain would render above bottom of screen, shift camera down
      const cameraBottomY = desiredBottomLeftY + this.height;
      if (cameraBottomY < maxTerrainHeight) {
        desiredBottomLeftY = maxTerrainHeight - this.height;
      }
    }

    // Smoothly move camera towards target
    this.bottomLeftWorldX += (desiredBottomLeftX - this.bottomLeftWorldX) * this.followSpeed * deltaTime;
    this.bottomLeftWorldY += (desiredBottomLeftY - this.bottomLeftWorldY) * this.followSpeed * deltaTime;

    // Clamp camera to world boundaries
    this.bottomLeftWorldX = Math.max(0, Math.min(this.bottomLeftWorldX, 8000 - this.width));
    this.bottomLeftWorldY = Math.max(Terrain.WORLD_BOTTOM, this.bottomLeftWorldY);
  }

  private getTerrainHeightAt(x: number): number {
    if (!this.terrain) {
      return 300; // Fallback if terrain not set
    }
    try {
      return this.terrain.getHeightAt(x);
    } catch {
      return 300; // Fallback if terrain height lookup fails
    }
  }

  updateSize(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  toScreenY(worldY: number): number {
    return this.height - Terrain.WORLD_TOP - worldY;
  }
}
