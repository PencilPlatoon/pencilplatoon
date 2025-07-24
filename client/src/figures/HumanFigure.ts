import { Vector2 } from "../game/types";
import { toCanvasY } from "../game/Terrain";

export class HumanFigure {
  static readonly LEG_HEIGHT = 10;
  static readonly LEG_WIDTH = 8;
  static readonly LEG_BOTTOM_OFFSET_Y = 0;
  static readonly LEG_TOP_OFFSET_Y = HumanFigure.LEG_HEIGHT;

  static readonly BODY_LENGTH = 15;
  static readonly BODY_BOTTOM_OFFSET = HumanFigure.LEG_TOP_OFFSET_Y;
  static readonly BODY_TOP_OFFSET_Y = HumanFigure.BODY_BOTTOM_OFFSET + HumanFigure.BODY_LENGTH;

  static readonly ARM_LENGTH = 12;
  static readonly ARM_Y_OFFSET = HumanFigure.BODY_TOP_OFFSET_Y;

  static readonly NECK_LENGTH = 8;
  static readonly NECK_BOTTOM_OFFSET_Y = HumanFigure.BODY_TOP_OFFSET_Y;
  static readonly NECK_TOP_OFFSET_Y = HumanFigure.NECK_BOTTOM_OFFSET_Y + HumanFigure.NECK_LENGTH;

  static readonly HAND_OFFSET_Y = HumanFigure.ARM_Y_OFFSET;

  static readonly HEAD_RADIUS = 8;
  static readonly HEAD_BOTTOM_OFFSET_Y = HumanFigure.NECK_TOP_OFFSET_Y;
  static readonly HEAD_CENTER_OFFSET_Y = HumanFigure.HEAD_BOTTOM_OFFSET_Y + HumanFigure.HEAD_RADIUS;
  static readonly HEAD_TOP_OFFSET = HumanFigure.HEAD_BOTTOM_OFFSET_Y + 2*HumanFigure.HEAD_RADIUS;

  static readonly FIGURE_WIDTH = 2*Math.max(
    HumanFigure.HEAD_RADIUS,
    HumanFigure.ARM_LENGTH,
    HumanFigure.LEG_WIDTH
  );
  static readonly FIGURE_HEIGHT = HumanFigure.HEAD_TOP_OFFSET;

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
    ctx.beginPath();
    ctx.arc(position.x,
        toCanvasY(position.y + HumanFigure.HEAD_CENTER_OFFSET_Y),
         HumanFigure.HEAD_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
    // Body
    ctx.beginPath();
    ctx.moveTo(position.x, toCanvasY(position.y + HumanFigure.BODY_BOTTOM_OFFSET));
    ctx.lineTo(position.x, toCanvasY(position.y + HumanFigure.BODY_TOP_OFFSET_Y));
    ctx.stroke();
    // Neck
    ctx.beginPath();
    ctx.moveTo(position.x, toCanvasY(position.y + HumanFigure.NECK_BOTTOM_OFFSET_Y));
    ctx.lineTo(position.x, toCanvasY(position.y + HumanFigure.NECK_TOP_OFFSET_Y));
    ctx.stroke();
    // Arms
    // Left arm
    ctx.beginPath();
    ctx.moveTo(position.x, toCanvasY(position.y + HumanFigure.ARM_Y_OFFSET));
    ctx.lineTo(position.x - HumanFigure.ARM_LENGTH, toCanvasY(position.y + HumanFigure.ARM_Y_OFFSET));
    ctx.stroke();
    // Right arm
    ctx.beginPath();
    ctx.moveTo(position.x, toCanvasY(position.y + HumanFigure.ARM_Y_OFFSET));
    ctx.lineTo(position.x + HumanFigure.ARM_LENGTH, toCanvasY(position.y + HumanFigure.ARM_Y_OFFSET));
    ctx.stroke();
    // Legs
    ctx.beginPath();
    // Left leg
    ctx.moveTo(position.x, toCanvasY(position.y + HumanFigure.LEG_TOP_OFFSET_Y));
    ctx.lineTo(
      position.x - HumanFigure.LEG_WIDTH,
      toCanvasY(position.y + HumanFigure.LEG_BOTTOM_OFFSET_Y)
    );
    // Right leg
    ctx.moveTo(position.x, toCanvasY(position.y + HumanFigure.LEG_TOP_OFFSET_Y));
    ctx.lineTo(
      position.x + HumanFigure.LEG_WIDTH,
      toCanvasY(position.y + HumanFigure.LEG_BOTTOM_OFFSET_Y)
    );
    ctx.stroke();
    ctx.restore();
  }
} 