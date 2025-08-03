import { toCanvasY } from "../game/Terrain";
import { EntityTransform } from "../game/EntityTransform";

export class HumanFigure {
  static readonly LEG_HEIGHT = 15;
  static readonly LEG_WIDTH = 8;
  static readonly LEG_BOTTOM_OFFSET_Y = 0;
  static readonly LEG_TOP_OFFSET_Y = HumanFigure.LEG_HEIGHT;

  static readonly UPPER_LEG_LENGTH = 8;
  static readonly LOWER_LEG_LENGTH = 8;
  static readonly KNEE_OFFSET_Y = HumanFigure.LOWER_LEG_LENGTH;

  static readonly BODY_LENGTH = 10;
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

  /** How far the hip moves (in px) during one half-cycle (π rad). 
   * Should be set to 2× the horizontal stride amplitude used in renderAnimatedLeg.
   */
  static readonly PX_PER_HALF_CYCLE = 12;   // 2 · STRIDE_X (see below)

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

  static updateWalkCycle(
    prevX: number,
    currX: number,
    currentPhase: number
  ): number {
    const dx = currX - prevX;

    const dPhase = (Math.abs(dx) * Math.PI) / HumanFigure.PX_PER_HALF_CYCLE;
  
    let phase = currentPhase + dPhase;
    phase %= 2 * Math.PI; // keep it in [0, 2π)
    return phase;
  }

  static render({
    ctx,
    transform,
    active,
    aimAngle,
    isWalking,
    walkCycle
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    active: boolean;
    aimAngle: number;
    isWalking: boolean;
    walkCycle: number;
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

    // Animated legs
    HumanFigure.renderLegs(ctx, position, isWalking, walkCycle, transform.facing);
    
    ctx.restore();
  }

  private static renderLegs(
    ctx: CanvasRenderingContext2D, 
    position: { x: number; y: number }, 
    isWalking: boolean, 
    walkCycle: number,
    facing: number,
  ) {
    if (isWalking) {
      // Animated walking legs
      const leftLegPhase = walkCycle;
      const rightLegPhase = (walkCycle + Math.PI) % (2 * Math.PI);
      
      // Left leg
      HumanFigure.renderAnimatedLeg(ctx, position, -HumanFigure.LEG_WIDTH, leftLegPhase, facing);
      // Right leg  
      HumanFigure.renderAnimatedLeg(ctx, position, HumanFigure.LEG_WIDTH, rightLegPhase, facing);
    } else {
      // Static standing legs
      HumanFigure.renderStaticLeg(ctx, position, -HumanFigure.LEG_WIDTH);
      HumanFigure.renderStaticLeg(ctx, position, HumanFigure.LEG_WIDTH);
    }
  }

  private static renderAnimatedLeg(
    ctx: CanvasRenderingContext2D,
    position: { x: number; y: number },
    legOffsetX: number,
    phase: number,
    facing: number
  ) {
    // -- constants you can tweak -------------------------------------------
    const STRIDE_X = 6;   // forward/back amplitude
    const LIFT   = 4;   // how high the foot comes up during swing
    // ----------------------------------------------------------------------
  
    // Hip joint is fixed directly under the body.
    const hip = {
      x: position.x,
      y: position.y + HumanFigure.LEG_TOP_OFFSET_Y
    };
  
    // Normalise to [0, 2π)
    const t = (phase % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  
    // ----------------------------------------------------------------------
    // swing is *first* half-cycle t∊[0, π); stance is [π, 2π)
    // ----------------------------------------------------------------------
    const swing = t < Math.PI;
  
    // Foot trajectory
    const foot = { x: 0, y: 0 };
  
    // Horizontal motion – same ellipse as before
    //   back → front during swing, front → back during stance
    foot.x = hip.x +
             legOffsetX -
             Math.cos(t) * STRIDE_X * facing;
  
    // Vertical motion
    foot.y = position.y + HumanFigure.LEG_BOTTOM_OFFSET_Y +
             (swing ? LIFT * Math.sin(t) : 0);   // lift only in swing
  
    // ----------------------------------------------------------------------
    // 2-bar IK to find the knee position (same math as before)
    // ----------------------------------------------------------------------
    const L1 = HumanFigure.UPPER_LEG_LENGTH;
    const L2 = HumanFigure.LOWER_LEG_LENGTH;
  
    // Vector hip→foot
    const dx = foot.x - hip.x;
    const dy = foot.y - hip.y;
    let d = Math.hypot(dx, dy);
  
    // Clamp so the foot is always reachable
    const maxReach = L1 + L2 - 1e-3;
    if (d > maxReach) d = maxReach;
  
    // Unit vector hip→foot
    const ux = dx / (d || 1e-6);
    const uy = dy / (d || 1e-6);
  
    // Angle at the hip (law of cosines)
    const cosHip = (L1*L1 + d*d - L2*L2) / (2*L1*d);
    const hipAngle = Math.acos(Math.min(1, Math.max(-1, cosHip)));
  
    // Knee bends “forward” relative to facing
    const px = -uy;
    const py =  ux;
  
    const along = Math.cos(hipAngle) * L1;
    const perp  = Math.sin(hipAngle) * L1 * facing;
  
    const knee = {
      x: hip.x + ux * along + px * perp,
      y: hip.y + uy * along + py * perp
    };
  
    // ----------------------------------------------------------------------
    // Draw the leg
    // ----------------------------------------------------------------------
    ctx.beginPath();
    ctx.moveTo(hip.x,   toCanvasY(hip.y));
    ctx.lineTo(knee.x,  toCanvasY(knee.y));
    ctx.lineTo(foot.x,  toCanvasY(foot.y));
    ctx.stroke();
  }

  private static renderStaticLeg(
    ctx: CanvasRenderingContext2D,
    position: { x: number; y: number },
    legOffsetX: number
  ) {
    // Simple straight leg for standing
    ctx.beginPath();
    ctx.moveTo(position.x, toCanvasY(position.y + HumanFigure.LEG_TOP_OFFSET_Y));
    ctx.lineTo(
      position.x + legOffsetX,
      toCanvasY(position.y + HumanFigure.LEG_BOTTOM_OFFSET_Y)
    );
    ctx.stroke();
  }
} 