import { BoundingBox, TerrainSegment, TerrainPoint } from "./types";
import { TerrainConfig } from "./LevelConfig";

export class Terrain {
  static readonly WORLD_TOP = 600; // The top of the world/screen for all entities
  static readonly WORLD_BOTTOM = 0; // The bottom of the world/screen for all entities
  static readonly LEVEL_WIDTH = 8000; // The width of the level for global access
  private segments: TerrainSegment[] = [];
  private terrainPoints: TerrainPoint[] = [];
  private groundLevel = Terrain.WORLD_BOTTOM + 100;
  private terrainColor: string = "rgba(0, 0, 0, 0.1)";

  constructor(terrainColor?: string) {
    if (terrainColor) {
      this.terrainColor = terrainColor;
    }
  }

  generateTerrain(config: TerrainConfig) {
    // Generate continuous sloped terrain line for 10 screens
    this.terrainPoints = [];
    
    // Create terrain points across the level width
    const pointSpacing = 100; // Points every 100 pixels
    const numPoints = Math.floor(Terrain.LEVEL_WIDTH / pointSpacing) + 1;
    
    for (let i = 0; i < numPoints; i++) {
      const x = i * pointSpacing;
      
      // Create varied terrain heights with smooth slopes
      let y = this.groundLevel;
      
      // Add variation based on config
      const wave1 = Math.sin(x * config.frequency * 2) * config.amplitude;
      const wave2 = Math.sin(x * config.frequency * 5) * (config.amplitude / 2);
      const wave3 = Math.sin(x * config.frequency + config.roughness) * (config.amplitude * config.roughness);
      
      y = this.groundLevel + 200 + wave1 + wave2 + wave3;
      
      // Ensure terrain doesn't go too low or high (now, y is clamped between bottom and top)
      y = Math.max(Terrain.WORLD_BOTTOM + 20, Math.min(Terrain.WORLD_TOP - 100, y));
      
      this.terrainPoints.push({ x, y });
    }
    
    // Create collision segments based on terrain points
    this.segments = [];
    for (let i = 0; i < this.terrainPoints.length - 1; i++) {
      const point1 = this.terrainPoints[i];
      const point2 = this.terrainPoints[i + 1];
      
      // Create a segment that covers the area below the terrain line (down to the bottom of the world)
      const minY = Math.min(point1.y, point2.y);
      const maxY = Math.max(point1.y, point2.y);
      const height = minY - Terrain.WORLD_BOTTOM; // Extend to bottom of screen
      this.segments.push({
        x: point1.x,
        y: Terrain.WORLD_BOTTOM,
        width: pointSpacing,
        height: height,
        type: 'ground'
      });
    }
  }

  getLevelWidth(): number {
    return Terrain.LEVEL_WIDTH;
  }

  checkCollision(absBounds: { upperLeft: { x: number; y: number }; lowerRight: { x: number; y: number } }): boolean {
    return this.segments.some(segment => 
      absBounds.upperLeft.x < segment.x + segment.width &&
      absBounds.lowerRight.x > segment.x &&
      absBounds.lowerRight.y < segment.y + segment.height &&
      absBounds.upperLeft.y > segment.y
    );
  }

  getHeightAt(x: number): number {
    // Interpolate height between terrain points
    if (this.terrainPoints.length < 2) throw new Error("Terrain not generated");
    // Find the two points that x is between
    for (let i = 0; i < this.terrainPoints.length - 1; i++) {
      const point1 = this.terrainPoints[i];
      const point2 = this.terrainPoints[i + 1];
      if (x >= point1.x && x <= point2.x) {
        // Linear interpolation between the two points
        const t = (x - point1.x) / (point2.x - point1.x);
        return point1.y + (point2.y - point1.y) * t;
      }
    }
    // If x is outside the terrain range, throw
    throw new Error(`x=${x} is outside the terrain range`);
  }

  render(ctx: CanvasRenderingContext2D) {
    if (this.terrainPoints.length < 2) return;
    
    // Draw terrain as a continuous line
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.beginPath();
    
    // Start from the first point
    ctx.moveTo(this.terrainPoints[0].x, toCanvasY(this.terrainPoints[0].y));
    
    // Draw lines to all other points
    for (let i = 1; i < this.terrainPoints.length; i++) {
      ctx.lineTo(this.terrainPoints[i].x, toCanvasY(this.terrainPoints[i].y));
    }
    
    ctx.stroke();
    
    // Optional: Fill the area below the terrain line for better visibility
    ctx.fillStyle = this.terrainColor;
    ctx.beginPath();
    ctx.moveTo(this.terrainPoints[0].x, toCanvasY(this.terrainPoints[0].y));
    for (let i = 1; i < this.terrainPoints.length; i++) {
      ctx.lineTo(this.terrainPoints[i].x, toCanvasY(this.terrainPoints[i].y));
    }
    // Close the path by going to bottom and back
    ctx.lineTo(this.terrainPoints[this.terrainPoints.length - 1].x, toCanvasY(Terrain.WORLD_BOTTOM));
    ctx.lineTo(this.terrainPoints[0].x, toCanvasY(Terrain.WORLD_BOTTOM));
    ctx.closePath();
    ctx.fill();
  }
}

export function toCanvasY(worldY: number): number {
  return Terrain.WORLD_TOP - worldY;
}
