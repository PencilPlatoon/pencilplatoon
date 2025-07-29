import { toCanvasY } from "../game/Terrain";
import { EntityTransform } from "../game/EntityTransform";

export class HumanFigure {
  static readonly LEG_HEIGHT = 10;
  static readonly LEG_WIDTH = 8;
  static readonly LEG_BOTTOM_OFFSET_Y = 0;
  static readonly LEG_TOP_OFFSET_Y = HumanFigure.LEG_HEIGHT;

  static readonly BODY_LENGTH = 15;
  static readonly BODY_BOTTOM_OFFSET = HumanFigure.LEG_TOP_OFFSET_Y;
  static readonly BODY_TOP_OFFSET_Y = HumanFigure.BODY_BOTTOM_OFFSET + HumanFigure.BODY_LENGTH;

  static readonly ARM_LENGTH = 12;
  static readonly ARM_X_OFFSET = 0; // Arm base is at center of figure
  static readonly ARM_Y_OFFSET = HumanFigure.BODY_TOP_OFFSET_Y;

  static readonly NECK_LENGTH = 8;
  static readonly NECK_BOTTOM_OFFSET_Y = HumanFigure.BODY_TOP_OFFSET_Y;
  static readonly NECK_TOP_OFFSET_Y = HumanFigure.NECK_BOTTOM_OFFSET_Y + HumanFigure.NECK_LENGTH;

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

  static getForwardHandTransform(aimAngle: number): EntityTransform {
    // Calculate the hand position by extending the arm at the aim angle
    const handX = HumanFigure.ARM_X_OFFSET + Math.cos(aimAngle) * HumanFigure.ARM_LENGTH;
    const handY = HumanFigure.ARM_Y_OFFSET + Math.sin(aimAngle) * HumanFigure.ARM_LENGTH;
    
    return new EntityTransform({ x: handX, y: handY }, aimAngle, 1);
  }

  static getBackHandTransform(aimAngle: number): EntityTransform {
    // Calculate the hand position by extending the arm at the aim angle
    // Back hand is on the opposite side of the body
    const handX = HumanFigure.ARM_X_OFFSET + Math.cos(aimAngle + Math.PI) * HumanFigure.ARM_LENGTH;
    const handY = HumanFigure.ARM_Y_OFFSET + Math.sin(aimAngle + Math.PI) * HumanFigure.ARM_LENGTH;
    
    return new EntityTransform({ x: handX, y: handY }, aimAngle + Math.PI, 1);
  }

  static render({
    ctx,
    transform,
    active,
    aimAngle = 0
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    active: boolean;
    aimAngle?: number;
  }) {
    if (!active) return;
    const position = transform.position;
    ctx.save();
    ctx.lineWidth = 2;
    
    // Debug mode: draw in blue
    if (window.__DEBUG_MODE__) {
      ctx.strokeStyle = 'blue';
    }
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
    
    // Backward arm (opposite to facing direction)
    const backHandTransform = HumanFigure.getBackHandTransform(0);
    const absoluteBackHandTransform = transform.applyTransform(backHandTransform);
    ctx.beginPath();
    ctx.moveTo(position.x, toCanvasY(position.y + HumanFigure.ARM_Y_OFFSET));
    ctx.lineTo(absoluteBackHandTransform.position.x, toCanvasY(absoluteBackHandTransform.position.y));
    ctx.stroke();
    
    // Forward arm (same as facing direction) - aiming
    const forwardHandTransform = HumanFigure.getForwardHandTransform(aimAngle);
    const absoluteForwardHandTransform = transform.applyTransform(forwardHandTransform);
    ctx.beginPath();
    ctx.moveTo(position.x, toCanvasY(position.y + HumanFigure.ARM_Y_OFFSET));
    ctx.lineTo(absoluteForwardHandTransform.position.x, toCanvasY(absoluteForwardHandTransform.position.y));
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