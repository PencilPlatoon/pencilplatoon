import { EntityTransform } from "../EntityTransform";
import { HumanFigure } from "../../figures/HumanFigure";

export class ThrowGrenadeMovement {
  static readonly THROW_CYCLE_DURATION_MS = 300;

  private throwCycle: number = 0; // 0 = not throwing, 1 = full throw motion
  private throwCycleStartTime: number = 0;
  private throwAnimationDuration: number = ThrowGrenadeMovement.THROW_CYCLE_DURATION_MS;

  startThrow(duration: number = ThrowGrenadeMovement.THROW_CYCLE_DURATION_MS): void {
    this.throwCycle = 1;
    this.throwCycleStartTime = Date.now();
    this.throwAnimationDuration = duration;
  }

  stopThrow(): void {
    this.throwCycle = 0;
  }

  isInThrowState(): boolean {
    return this.throwCycle > 0;
  }

  getThrowProgress(): number {
    if (!this.isInThrowState()) return 0;
    const animationTime = Date.now() - this.throwCycleStartTime;
    // throwCycle goes from 1 (start) to 0 (end)
    return Math.max(0, 1 - (animationTime / this.throwAnimationDuration));
  }

  isThrowComplete(): boolean {
    if (!this.isInThrowState()) return false;
    return this.getThrowProgress() === 0;
  }

  reset(): void {
    this.throwCycle = 0;
    this.throwCycleStartTime = 0;
  }

  getBackArmAngle(aimAngle: number): number {
    if (!this.isInThrowState()) {
      return aimAngle;
    }
    
    // During throwing, the back arm swings up and forward
    // Animation goes from 1 (start) to 0 (end)
    const throwProgress = 1 - this.getThrowProgress();
    return aimAngle + Math.PI * 0.3 * throwProgress; // Swing up to 30 degrees (positive for upward motion)
  }

  getGrenadeTransform({
    playerTransform,
    aimAngle
  }: {
    playerTransform: EntityTransform;
    aimAngle: number;
  }): EntityTransform {
    const backArmAngle = this.getBackArmAngle(aimAngle);
    const backHandTransform = HumanFigure.getBackHandTransform(backArmAngle);
    return playerTransform.applyTransform(backHandTransform);
  }

  getReleaseTransform({
    playerTransform,
    aimAngle
  }: {
    playerTransform: EntityTransform;
    aimAngle: number;
  }): EntityTransform {
    // Get the position where grenade will be released (at end of animation)
    const releaseAngle = aimAngle + Math.PI * 0.3; // Final position of throw (30 degrees up)
    const backHandTransform = HumanFigure.getBackHandTransform(releaseAngle);
    const releasePosition = playerTransform.applyTransform(backHandTransform).position;
    // Return transform with release position, aim angle for throw direction, and player facing
    return new EntityTransform(releasePosition, aimAngle, playerTransform.facing);
  }

  getThrowCycle(): number {
    return this.getThrowProgress();
  }
}

