import { toCanvasY } from "../game/world/Terrain";
import { EntityTransform } from "../game/types/EntityTransform";
import { HoldableObjectType } from "../game/types/interfaces";
import { Vector2 } from "../game/types/Vector2";

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

  static readonly UPPER_ARM_LENGTH = 12;
  static readonly LOWER_ARM_LENGTH = 12;
  static readonly ARM_LENGTH = 24; // Total arm length (for hand position calculations)
  static readonly ARM_X_OFFSET = 0; // Arm base is at center of figure
  static readonly ARM_Y_OFFSET = HumanFigure.BODY_TOP_OFFSET_Y;
  
  // Weapon offsets for single-handed weapons (pistols, etc.)
  static readonly WEAPON_HORIZONTAL_OFFSET_SINGLE_HANDED = 16; // Weapons positioned 12px forward from center
  static readonly WEAPON_VERTICAL_OFFSET_SINGLE_HANDED = 0; // Negative = below shoulder (positive Y is up)
  
  // Weapon offsets for two-handed weapons (rifles, etc.)
  static readonly WEAPON_HORIZONTAL_OFFSET_TWO_HANDED = 6; // Weapons positioned 6px forward from center
  static readonly WEAPON_VERTICAL_OFFSET_TWO_HANDED = -4; // Negative = below shoulder (positive Y is up)
  
  // Back hand resting position (when not holding weapon)
  static readonly BACK_HAND_RESTING_X_OFFSET = -10; // Negative = backward (positive X is forward)
  static readonly BACK_HAND_RESTING_Y_OFFSET = -15; // Negative = downward (positive Y is up, 2:1 ratio with X)

  static readonly NECK_LENGTH = 8;
  static readonly NECK_BOTTOM_OFFSET_Y = HumanFigure.BODY_TOP_OFFSET_Y;
  static readonly NECK_TOP_OFFSET_Y = HumanFigure.NECK_BOTTOM_OFFSET_Y + HumanFigure.NECK_LENGTH;

  static readonly HEAD_RADIUS = 8;
  static readonly HEAD_BOTTOM_OFFSET_Y = HumanFigure.NECK_TOP_OFFSET_Y;
  static readonly HEAD_CENTER_OFFSET_Y = HumanFigure.HEAD_BOTTOM_OFFSET_Y + HumanFigure.HEAD_RADIUS;
  static readonly HEAD_TOP_OFFSET = HumanFigure.HEAD_BOTTOM_OFFSET_Y + 2*HumanFigure.HEAD_RADIUS;

  static readonly FIGURE_WIDTH = 2 * Math.max(
    HumanFigure.HEAD_RADIUS,
    HumanFigure.ARM_LENGTH, // 18px - longer arms extend further
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

  /**
   * Get the transform for the forward hand (arm on the same side as facing direction).
   * 
   * Note: In world coordinates, +Y is UP (converted to canvas coords via toCanvasY).
   * 
   * @param aimAngle - The angle of the arm:
   *   0 → horizontal (forward when facing right)
   *   Positive (e.g. π/6) → aiming upward (sin > 0, +Y in world coords)
   *   Negative (e.g. -π/6) → aiming downward (sin < 0, -Y in world coords)
   * @returns EntityTransform with hand position and the same angle
   */
  static getForwardHandTransform(aimAngle: number): EntityTransform {
    // Calculate the hand position by extending the arm at the aim angle
    // Use 85% of max reach to ensure visible elbow bend (not fully extended)
    const reachDistance = HumanFigure.ARM_LENGTH * 0.85;
    const handX = HumanFigure.ARM_X_OFFSET + Math.cos(aimAngle) * reachDistance;
    const handY = HumanFigure.ARM_Y_OFFSET + Math.sin(aimAngle) * reachDistance;
    
    return new EntityTransform({ x: handX, y: handY }, aimAngle, 1);
  }

  /**
   * Get the transform for the back hand (arm on the opposite side from facing direction).
   * 
   * IMPORTANT: This function mirrors the angle around π (horizontal backward) to position 
   * the arm on the opposite side of the body. Unlike getForwardHandTransform which rotates
   * counterclockwise for positive angles, this rotates clockwise for positive angles.
   * 
   * Note: In world coordinates, +Y is UP (converted to canvas coords via toCanvasY).
   * 
   * @param aimAngle - The "relative" angle that will be mirrored around π:
   *   0 → actual angle π (horizontal backward)
   *   Positive (e.g. π/6) → actual angle 5π/6, sin=+0.5 (pointing UP, rotates clockwise from backward)
   *   Negative (e.g. -π/6) → actual angle 7π/6, sin=-0.5 (pointing DOWN, rotates counterclockwise from backward)
   * 
   * Usage:
   *   To point the back arm up, pass positive angle (e.g. π/6).
   *   To point the back arm down, pass negative angle (e.g. -π/6).
   *   To point the back arm horizontal backward, pass 0.
   * 
   * @returns EntityTransform with hand position and angle (π - aimAngle)
   */
  static getBackHandTransform(aimAngle: number): EntityTransform {
    // Calculate the hand position by extending the arm at the mirrored angle
    // Back hand is on the opposite side of the body
    // Use 85% of max reach to ensure visible elbow bend (not fully extended)
    const actualAngle = Math.PI - aimAngle;
    const reachDistance = HumanFigure.ARM_LENGTH * 0.85;
    const handX = HumanFigure.ARM_X_OFFSET + Math.cos(actualAngle) * reachDistance;
    const handY = HumanFigure.ARM_Y_OFFSET + Math.sin(actualAngle) * reachDistance;
    
    return new EntityTransform({ x: handX, y: handY }, actualAngle, 1);
  }

  /**
   * Get the resting position for the back hand when not holding anything.
   * Hand positioned down and back at 2:1 ratio (down:back).
   * Upper arm slopes down and back, lower arm slopes down and forward.
   */
  static getBackHandRestingTransform(): EntityTransform {
    const handX = HumanFigure.ARM_X_OFFSET + HumanFigure.BACK_HAND_RESTING_X_OFFSET;
    const handY = HumanFigure.ARM_Y_OFFSET + HumanFigure.BACK_HAND_RESTING_Y_OFFSET;
    
    // Calculate angle for this position (used for weapon orientation if needed)
    const angle = Math.atan2(HumanFigure.BACK_HAND_RESTING_Y_OFFSET, HumanFigure.BACK_HAND_RESTING_X_OFFSET);
    
    return new EntityTransform({ x: handX, y: handY }, angle, 1);
  }

  /**
   * Calculate hand position for a single hold point on a weapon.
   * 
   * Note: weaponTransform.position is already positioned so that (pivotGripX, pivotGripY) is at the body pivot.
   * 
   * @param weaponTransform - Weapon's position in player-relative coords (origin at weapon reference)
   * @param holdableObjectType - Weapon type with hold position data
   * @param weaponHeight - Weapon height
   * @param holdRatioPosition - Hold position as 2D vector (0-1)
   * @returns Hand position (relative to player)
   */
  static getHandPositionForWeapon(
    weaponTransform: EntityTransform,
    holdableObjectType: HoldableObjectType,
    weaponHeight: number,
    holdRatioPosition: Vector2
  ): Vector2 {
    const weaponPos = weaponTransform.position;
    const rotation = weaponTransform.rotation;
    const weaponSize = holdableObjectType.size;
    const pivotGripRatioX = holdableObjectType.primaryHoldRatioPosition.x;
    const pivotGripRatioY = holdableObjectType.primaryHoldRatioPosition.y;

    // IMPORTANT: weaponPos is the position of the weapon's ANCHOR (which is at pivotGrip)
    // The weapon's bounding box is anchored at (pivotGripX, pivotGripY), so weaponPos represents that point
    // To get other hold points, calculate their 2D offset FROM the anchor point, then rotate
    // X offset (along weapon): (holdRatioPosition.x - pivotGripX) * weaponSize
    // Y offset (perpendicular): (holdRatioPosition.y - pivotGripY) * weaponHeight
    
    return {
      x: weaponPos.x + Math.cos(rotation) * weaponSize * (holdRatioPosition.x - pivotGripRatioX) - Math.sin(rotation) * weaponHeight * (holdRatioPosition.y - pivotGripRatioY),
      y: weaponPos.y + Math.sin(rotation) * weaponSize * (holdRatioPosition.x - pivotGripRatioX) + Math.cos(rotation) * weaponHeight * (holdRatioPosition.y - pivotGripRatioY)
    };
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

  /**
   * Calculate the position of a joint in a two-bar linkage using inverse kinematics.
   * 
   * Uses the Law of Cosines to find the bend angle, then positions the joint
   * perpendicular to the start→end line based on the bend direction.
   * 
   * @param startPos - Start position (e.g., shoulder or hip)
   * @param endPos - End position (e.g., hand or foot)
   * @param length1 - Length of first segment (e.g., upper arm or upper leg)
   * @param length2 - Length of second segment (e.g., forearm or lower leg)
   * @param bendMultiplier - Combined bend direction: 1 (forward/up), -1 (downward), multiplied by facing
   * @returns Joint position (e.g., elbow or knee)
   */
  static calculateTwoBarJointPosition({
    startPos,
    endPos,
    length1,
    length2,
    bendMultiplier
  }: {
    startPos: Vector2;
    endPos: Vector2;
    length1: number;
    length2: number;
    bendMultiplier: number;
  }): Vector2 {
    // Vector from start to end
    const dx = endPos.x - startPos.x;
    const dy = endPos.y - startPos.y;
    let distance = Math.hypot(dx, dy);

    // Clamp distance so end point is always reachable
    const maxReach = length1 + length2 - 1e-3;
    if (distance > maxReach) {
      distance = maxReach;
    }

    // Unit vector from start to end
    const ux = dx / (distance || 1e-6);
    const uy = dy / (distance || 1e-6);

    // Angle at the start joint using Law of Cosines
    const cosAngle = (length1 * length1 + distance * distance - length2 * length2) / (2 * length1 * distance);
    const angle = Math.acos(Math.min(1, Math.max(-1, cosAngle)));

    // Perpendicular vector (rotated 90° from start→end direction)
    const px = -uy;
    const py = ux;

    // Calculate joint position
    const alongDistance = Math.cos(angle) * length1;
    const perpDistance = Math.sin(angle) * length1 * bendMultiplier;
    
    return {
      x: startPos.x + ux * alongDistance + px * perpDistance,
      y: startPos.y + uy * alongDistance + py * perpDistance
    };
  }

  static render({
    ctx,
    transform,
    active,
    aimAngle,
    isWalking,
    walkCycle,
    throwingAnimation = 0,
    reloadBackArmAngle = null,
    forwardHandPosition = null,
    backHandPosition = null
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    active: boolean;
    aimAngle: number;
    isWalking: boolean;
    walkCycle: number;
    throwingAnimation?: number;
    reloadBackArmAngle?: number | null;
    forwardHandPosition?: Vector2 | null;
    backHandPosition?: Vector2 | null;
  }) {
    if (!active) return;
    const position = transform.position;
    ctx.save();
    ctx.lineWidth = 2;
    
    // Debug mode: draw in dark pink
    if (window.__DEBUG_MODE__) {
      ctx.strokeStyle = '#c2185b';
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
    // Arms with elbows
    const shoulder = {
      x: position.x,
      y: position.y + HumanFigure.ARM_Y_OFFSET
    };
    
    // Calculate back hand position
    let backHandPos: Vector2;
    let backArmBendDownward = true;
    let backArmElbowBackward = false;
    
    if (backHandPosition) {
      // Use provided hand position (from weapon dual-hold system)
      const absoluteBackHand = transform.applyTransform(new EntityTransform(backHandPosition, 0, 1));
      backHandPos = absoluteBackHand.position;
    } else if (reloadBackArmAngle !== null) {
      // During reloading, use the reload animation angle
      const backHandTransform = HumanFigure.getBackHandTransform(reloadBackArmAngle);
      const absoluteBackHandTransform = transform.applyTransform(backHandTransform);
      backHandPos = absoluteBackHandTransform.position;
    } else if (throwingAnimation > 0) {
      // During throwing, the back arm swings up and forward
      const throwProgress = 1 - throwingAnimation;
      const throwAngle = Math.PI * 0.3 * throwProgress;
      const backHandTransform = HumanFigure.getBackHandTransform(throwAngle);
      const absoluteBackHandTransform = transform.applyTransform(backHandTransform);
      backHandPos = absoluteBackHandTransform.position;
    } else {
      // Resting position: down and back at 2:1 ratio
      const backHandTransform = HumanFigure.getBackHandRestingTransform();
      const absoluteBackHandTransform = transform.applyTransform(backHandTransform);
      backHandPos = absoluteBackHandTransform.position;
      backArmBendDownward = true;
      backArmElbowBackward = true; // Elbow points backward (opposite facing)
    }
    
    HumanFigure.renderArm(
      ctx,
      shoulder,
      backHandPos,
      transform.facing,
      backArmBendDownward,
      backArmElbowBackward
    );
    
    // Calculate forward hand position
    let forwardHandPos: Vector2;
    
    if (forwardHandPosition) {
      // Use provided hand position (from weapon dual-hold system)
      const absoluteForwardHand = transform.applyTransform(new EntityTransform(forwardHandPosition, 0, 1));
      forwardHandPos = absoluteForwardHand.position;
    } else {
      // Default: use aim angle to calculate hand position
      const forwardHandTransform = HumanFigure.getForwardHandTransform(aimAngle);
      const absoluteForwardHandTransform = transform.applyTransform(forwardHandTransform);
      forwardHandPos = absoluteForwardHandTransform.position;
    }
    
    HumanFigure.renderArm(
      ctx,
      shoulder,
      forwardHandPos,
      transform.facing,
      true, // Forward arm: elbow bends downward
      false
    );

    // Animated legs
    HumanFigure.renderLegs(ctx, position, isWalking, walkCycle, transform.facing);
    
    ctx.restore();
  }

  /**
   * Render an arm with elbow joint using 2-bar IK
   */
  private static renderArm(
    ctx: CanvasRenderingContext2D,
    shoulderPos: Vector2,
    handPos: Vector2,
    facing: number,
    bendDownward: boolean = true,
    elbowBackward: boolean = false
  ) {
    // Calculate bend multiplier for IK
    // When elbowBackward is true, invert BOTH facing and bendDownward
    const effectiveFacing = elbowBackward ? -facing : facing;
    const effectiveBendDownward = elbowBackward ? !bendDownward : bendDownward;
    const bendMultiplier = (effectiveBendDownward ? -1 : 1) * effectiveFacing;
    
    const elbow = HumanFigure.calculateTwoBarJointPosition({
      startPos: shoulderPos,
      endPos: handPos,
      length1: HumanFigure.UPPER_ARM_LENGTH,
      length2: HumanFigure.LOWER_ARM_LENGTH,
      bendMultiplier
    });

    // Draw upper arm: shoulder → elbow
    ctx.beginPath();
    ctx.moveTo(shoulderPos.x, toCanvasY(shoulderPos.y));
    ctx.lineTo(elbow.x, toCanvasY(elbow.y));
    ctx.stroke();

    // Draw forearm: elbow → hand
    ctx.beginPath();
    ctx.moveTo(elbow.x, toCanvasY(elbow.y));
    ctx.lineTo(handPos.x, toCanvasY(handPos.y));
    ctx.stroke();
  }

  private static renderLegs(
    ctx: CanvasRenderingContext2D, 
    position: Vector2, 
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
    position: Vector2,
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
    // Use shared 2-bar IK to find the knee position
    // ----------------------------------------------------------------------
    const knee = HumanFigure.calculateTwoBarJointPosition({
      startPos: hip,
      endPos: foot,
      length1: HumanFigure.UPPER_LEG_LENGTH,
      length2: HumanFigure.LOWER_LEG_LENGTH,
      bendMultiplier: facing // Knees bend forward in facing direction
    });
  
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
    position: Vector2,
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