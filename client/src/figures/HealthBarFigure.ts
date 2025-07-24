import { Vector2 } from "../game/types";
import { toCanvasY } from "../game/Terrain";

export class HealthBarFigure {
  static readonly WIDTH = 30;
  static readonly HEIGHT = 4;
  static render({
    ctx,
    centerPosition,
    health,
    maxHealth
  }: {
    ctx: CanvasRenderingContext2D;
    centerPosition: Vector2;
    health: number;
    maxHealth: number;
  }) {
    const healthBarWidth = HealthBarFigure.WIDTH;
    const healthBarHeight = HealthBarFigure.HEIGHT;
    const healthPercentage = health / maxHealth;
    ctx.save();
    ctx.fillStyle = "red";
    ctx.fillRect(
      centerPosition.x - healthBarWidth / 2,
      toCanvasY(centerPosition.y),
      healthBarWidth,
      healthBarHeight
    );
    ctx.fillStyle = "green";
    ctx.fillRect(
      centerPosition.x - healthBarWidth / 2,
      toCanvasY(centerPosition.y),
      healthBarWidth * healthPercentage,
      healthBarHeight
    );
    ctx.restore();
  }
} 