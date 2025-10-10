import { TerrainSegment, TerrainPoint } from "./types";
import { TerrainConfig } from "./LevelConfig";
import { TerrainFigure } from "../figures/TerrainFigure";
import { seededRandom } from "../lib/utils";

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

  calculateSlopeAt(x: number, sampleDistance: number = 20): number {
    try {
      const leftHeight = this.getHeightAt(x - sampleDistance);
      const rightHeight = this.getHeightAt(x + sampleDistance);
      return (rightHeight - leftHeight) / (sampleDistance * 2);
    } catch (error) {
      // If we can't get height at either point, return 0 (flat)
      return 0;
    }
  }

  render(ctx: CanvasRenderingContext2D) {
    TerrainFigure.render({
      ctx,
      terrainPoints: this.terrainPoints,
      terrainColor: this.terrainColor,
      worldBottom: Terrain.WORLD_BOTTOM,
    });
  }
}

export function toCanvasY(worldY: number): number {
  return Terrain.WORLD_TOP - worldY;
}
