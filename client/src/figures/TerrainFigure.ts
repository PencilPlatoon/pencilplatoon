import { TerrainPoint } from "../game/types";
import { toCanvasY } from "../game/Terrain";

export class TerrainFigure {
  static render({
    ctx,
    terrainPoints,
    terrainColor = "rgba(0, 0, 0, 0.1)",
    worldBottom,
  }: {
    ctx: CanvasRenderingContext2D;
    terrainPoints: TerrainPoint[];
    terrainColor: string;
    worldBottom: number;
  }) {
    if (!terrainPoints || terrainPoints.length < 2) return;

    // Draw terrain as a continuous line
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(terrainPoints[0].x, toCanvasY(terrainPoints[0].y));
    for (let i = 1; i < terrainPoints.length; i++) {
      ctx.lineTo(terrainPoints[i].x, toCanvasY(terrainPoints[i].y));
    }
    ctx.stroke();

    // Fill the area below the terrain line for better visibility
    ctx.fillStyle = terrainColor;
    ctx.beginPath();
    ctx.moveTo(terrainPoints[0].x, toCanvasY(terrainPoints[0].y));
    for (let i = 1; i < terrainPoints.length; i++) {
      ctx.lineTo(terrainPoints[i].x, toCanvasY(terrainPoints[i].y));
    }
    ctx.lineTo(terrainPoints[terrainPoints.length - 1].x, toCanvasY(worldBottom));
    ctx.lineTo(terrainPoints[0].x, toCanvasY(worldBottom));
    ctx.closePath();
    ctx.fill();
  }
} 