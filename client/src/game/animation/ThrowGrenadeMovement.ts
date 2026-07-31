import { EntityTransform } from "@/game/types/EntityTransform";
import { Vector2, Vector2Utils } from "@/game/types/Vector2";
import { HumanFigure } from "@/rendering/HumanFigure";
import { TimedAnimation } from "./TimedAnimation";

/**
 * Drives an OVERHAND grenade throw: the throwing (back) hand sweeps on a circle
 * around the shoulder, like a pitcher's arm, then lets go into the flight.
 *
 * The hand is at arm's reach from the shoulder at angle θ. It winds up cocked
 * back, then sweeps over the top to the release. The release angle is chosen so
 * the swing's tangent points exactly along the aim (θ_release = π/2 + aim), which
 * puts the release high — above the front hand — and makes the launch direction
 * continuous. The swing's angular speed is time-warped to reach |V|/reach right
 * at release, so the hand speed there equals the launch speed too. Thus position,
 * direction, and speed are all continuous where the arc hands off to the flight
 * parabola. A hard throw whips through almost instantly; a soft throw lingers.
 */
export class ThrowGrenadeMovement extends TimedAnimation {
  static readonly THROW_CYCLE_DURATION_MS = 300;
  /** Total angle the arm sweeps around the shoulder during the wind-up. */
  private static readonly WINDUP_SWEEP = 1.2; // radians (~69°)

  private launchAim = 0;
  private launchSpeed = 0;
  private snapExponent = 1;

  /** Neutral hold / wind-up start: the arm cocked back by the full sweep. */
  static holdRel(aim: number): Vector2 {
    return HumanFigure.handAtAngle(
      ThrowGrenadeMovement.releaseAngle(aim) + ThrowGrenadeMovement.WINDUP_SWEEP
    );
  }

  startThrow(
    aimAngle = 0,
    launchSpeed = 0,
    duration: number = ThrowGrenadeMovement.THROW_CYCLE_DURATION_MS
  ): void {
    this.launchAim = aimAngle;
    this.launchSpeed = launchSpeed;
    // Ease exponent so the swing's angular speed reaches |V|/reach at release,
    // making the hand's on-screen speed match the launch speed (velocity continuity).
    const durationSec = ThrowGrenadeMovement.THROW_CYCLE_DURATION_MS / 1000;
    this.snapExponent = launchSpeed > 0
      ? (launchSpeed * durationSec) / (HumanFigure.HAND_REACH * ThrowGrenadeMovement.WINDUP_SWEEP)
      : 1;
    this.startAnimation(duration);
  }

  stopThrow(): void {
    this.stopAnimation();
  }

  isInThrowState(): boolean {
    return this.isInProgress();
  }

  /** 1 at the start of the throw, 0 at release. */
  getThrowProgress(): number {
    if (!this.isInProgress()) return 0;
    return Math.max(0, 1 - this.getProgress());
  }

  isThrowComplete(): boolean {
    if (!this.isInProgress()) return false;
    return this.getThrowProgress() === 0;
  }

  getLaunchAim(): number {
    return this.launchAim;
  }

  /** Launch velocity in world space (facing applied) — the flight's initial velocity. */
  getLaunchVelocity(facing: number): Vector2 {
    return Vector2Utils.fromAngle(this.launchAim, this.launchSpeed, facing);
  }

  /** Where the grenade leaves the hand — high, with the swing tangent along the aim. */
  getReleaseRelTransform(aim: number): EntityTransform {
    return new EntityTransform(HumanFigure.handAtAngle(ThrowGrenadeMovement.releaseAngle(aim)), aim, 1);
  }

  /** Grenade position at the current (time-warped) point along the swing. */
  getGrenadeRelTransform(): EntityTransform {
    return new EntityTransform(HumanFigure.handAtAngle(this.armAngle()), this.launchAim, 1);
  }

  /** Arm angle at release: the swing tangent points along the aim direction. */
  private static releaseAngle(aim: number): number {
    return Math.PI / 2 + aim;
  }

  /**
   * Arm angle at the current animation progress p ∈ [0, 1]. The arm sweeps
   * clockwise (θ decreasing) from cocked-back to release:
   *
   *   θ(p) = θ_release + SWEEP·(1 - p^snap)
   */
  private armAngle(): number {
    const release = ThrowGrenadeMovement.releaseAngle(this.launchAim);
    const p = Math.min(1, Math.max(0, this.getProgress()));
    return release + ThrowGrenadeMovement.WINDUP_SWEEP * (1 - Math.pow(p, this.snapExponent));
  }
}
