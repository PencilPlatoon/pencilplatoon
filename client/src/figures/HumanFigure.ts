import { Vector2 } from "../game/types";
import { toCanvasY } from "../game/Terrain";

export class HumanFigure {
  static readonly LEG_TOP_OFFSET = 10;
  static readonly LEG_X_OFFSET = 8;
  static readonly BODY_TOP_OFFSET = 10;
  static readonly ARM_Y_OFFSET = 25;
  static readonly HAND_OFFSET_X = 12;
  static readonly HAND_OFFSET_Y = 25;
  static readonly NECK_LENGTH = 8;
  static readonly HEAD_OFFSET_Y = 48;
  static readonly HEAD_RADIUS = 8;
  static readonly FIGURE_WIDTH = 28;
  static readonly FIGURE_HEIGHT = HumanFigure.HEAD_OFFSET_Y + HumanFigure.HEAD_RADIUS + HumanFigure.NECK_LENGTH;

  static getWidth() {
    return HumanFigure.FIGURE_WIDTH;
  }

  static getHeight() {
    return HumanFigure.FIGURE_HEIGHT;
  }

  static render({
    ctx,
    position,
    active
  }: {
    ctx: CanvasRenderingContext2D;
    position: Vector2;
    active: boolean;
  }) {
    if (!active) return;
    ctx.save();
    ctx.lineWidth = 2;
    // Head
    const headRadius = HumanFigure.HEAD_RADIUS;
    const headCenterY = position.y + HumanFigure.HEAD_OFFSET_Y;
    ctx.beginPath();
    ctx.arc(position.x, toCanvasY(headCenterY), headRadius, 0, Math.PI * 2);
    ctx.stroke();
    // Body
    ctx.beginPath();
    ctx.moveTo(position.x, toCanvasY(headCenterY - headRadius));
    ctx.lineTo(position.x, toCanvasY(position.y + HumanFigure.BODY_TOP_OFFSET));
    ctx.stroke();
    // Arms
    ctx.beginPath();
    ctx.moveTo(position.x - HumanFigure.HAND_OFFSET_X, toCanvasY(position.y + HumanFigure.ARM_Y_OFFSET));
    ctx.lineTo(position.x + HumanFigure.HAND_OFFSET_X, toCanvasY(position.y + HumanFigure.ARM_Y_OFFSET));
    ctx.stroke();
    // Legs
    ctx.beginPath();
    ctx.moveTo(position.x, toCanvasY(position.y + HumanFigure.LEG_TOP_OFFSET));
    ctx.lineTo(position.x - HumanFigure.LEG_X_OFFSET, toCanvasY(position.y));
    ctx.moveTo(position.x, toCanvasY(position.y + HumanFigure.LEG_TOP_OFFSET));
    ctx.lineTo(position.x + HumanFigure.LEG_X_OFFSET, toCanvasY(position.y));
    ctx.stroke();
    ctx.restore();
  }
} 