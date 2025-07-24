import { Vector2 } from "../game/types";
import { toCanvasY } from "../game/Terrain";

export class HealthBarFigure {
  static render({
    ctx,
    position,
    health,
    maxHealth,
    headY
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2;
    health: number;
    maxHealth: number;
    headY: number;
  }) {
    const healthBarWidth = 30;
    const healthBarHeight = 4;
    const healthPercentage = health / maxHealth;
    ctx.save();
    ctx.fillStyle = "red";
    ctx.fillRect(
      position.x - healthBarWidth / 2,
      toCanvasY(headY),
      healthBarWidth,
      healthBarHeight
    );
    ctx.fillStyle = "green";
    ctx.fillRect(
      position.x - healthBarWidth / 2,
      toCanvasY(headY),
      healthBarWidth * healthPercentage,
      healthBarHeight
    );
    ctx.restore();
  }
} 