import { toCanvasY } from "../game/Terrain";
import { EntityTransform } from "../game/EntityTransform";

export class HealthBarFigure {
  static readonly WIDTH = 30;
  static readonly HEIGHT = 4;
  static render({
    ctx,
    transform,
    health,
    maxHealth
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    health: number;
    maxHealth: number;
  }) {
    const position = transform.position;
    const healthBarWidth = HealthBarFigure.WIDTH;
    const healthBarHeight = HealthBarFigure.HEIGHT;
    const healthPercentage = health / maxHealth;
    ctx.save();
    ctx.fillStyle = "red";
    ctx.fillRect(
      position.x - healthBarWidth / 2,
      toCanvasY(position.y),
      healthBarWidth,
      healthBarHeight
    );
    ctx.fillStyle = "green";
    ctx.fillRect(
      position.x - healthBarWidth / 2,
      toCanvasY(position.y),
      healthBarWidth * healthPercentage,
      healthBarHeight
    );
    ctx.restore();
  }
} 