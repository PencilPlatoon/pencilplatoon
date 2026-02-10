import { EntityTransform } from "@/game/types/EntityTransform";
import { HumanFigure } from "@/rendering/HumanFigure";
import { TimedAnimation } from "./TimedAnimation";

export class ThrowGrenadeMovement extends TimedAnimation {
  static readonly THROW_CYCLE_DURATION_MS = 300;

  startThrow(duration: number = ThrowGrenadeMovement.THROW_CYCLE_DURATION_MS): void {
    this.startAnimation(duration);
  }

  stopThrow(): void {
    this.stopAnimation();
  }

  isInThrowState(): boolean {
    return this.isInProgress();
  }

  getThrowProgress(): number {
    if (!this.isInProgress()) return 0;
    // throwCycle goes from 1 (start) to 0 (end) — inverted from base progress
    return Math.max(0, 1 - this.getProgress());
  }

  isThrowComplete(): boolean {
    if (!this.isInProgress()) return false;
    return this.getThrowProgress() === 0;
  }

  getBackArmAngle(aimAngle: number): number {
    if (!this.isInProgress()) {
      return aimAngle;
    }

    // During throwing, the back arm swings up and forward
    // Animation goes from 1 (start) to 0 (end)
    const throwProgress = 1 - this.getThrowProgress();
    return aimAngle + Math.PI * 0.3 * throwProgress; // Swing up to 30 degrees (positive for upward motion)
  }

  getGrenadeRelTransform(aimAngle: number): EntityTransform {
    const backArmAngle = this.getBackArmAngle(aimAngle);
    return HumanFigure.getBackHandTransform(backArmAngle);
  }

  getReleaseRelTransform(aimAngle: number): EntityTransform {
    // Get the relative transform where grenade will be released (at end of animation)
    const releaseAngle = aimAngle + Math.PI * 0.3; // Final position of throw (30 degrees up)
    return HumanFigure.getBackHandTransform(releaseAngle);
  }

  getThrowCycle(): number {
    return this.getThrowProgress();
  }
}
