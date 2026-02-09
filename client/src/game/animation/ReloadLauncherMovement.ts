import { EntityTransform } from "@/game/types/EntityTransform";
import { LaunchingWeapon } from "@/game/weapons/LaunchingWeapon";
import { HumanFigure } from "@/rendering/HumanFigure";

export class ReloadLauncherMovement {
  private isReloading: boolean = false;
  private reloadStartTime: number = 0;
  private reloadAnimationDuration: number = 0;

  constructor(private getNow: () => number = Date.now) {}

  // Reload animation phase durations (as fractions of total duration)
  private static readonly PHASE_DURATIONS = [0.2, 0.1, 0.25, 0.3, 0.15] as const;
  // Precomputed cumulative boundaries: [0.2, 0.3, 0.55, 0.85, 1.0]
  private static readonly PHASE_BOUNDARIES = ReloadLauncherMovement.PHASE_DURATIONS.reduce<number[]>(
    (acc, d) => { acc.push((acc[acc.length - 1] ?? 0) + d); return acc; },
    []
  );

  startReload(duration: number): void {
    this.isReloading = true;
    this.reloadStartTime = this.getNow();
    this.reloadAnimationDuration = duration;
  }

  stopReload(): void {
    this.isReloading = false;
  }

  isInReloadState(): boolean {
    return this.isReloading;
  }

  getElapsedTime(): number {
    if (!this.isReloading) return 0;
    return this.getNow() - this.reloadStartTime;
  }

  isReloadComplete(): boolean {
    if (!this.isReloading) return false;
    return this.getElapsedTime() >= this.reloadAnimationDuration;
  }

  reset(): void {
    this.isReloading = false;
    this.reloadStartTime = 0;
  }

  private getAnimationState(): { phase: number; progress: number } | null {
    if (!this.isReloading) return null;

    const elapsedTime = this.getElapsedTime();
    const totalProgress = Math.min(1, elapsedTime / this.reloadAnimationDuration);

    const boundaries = ReloadLauncherMovement.PHASE_BOUNDARIES;
    const durations = ReloadLauncherMovement.PHASE_DURATIONS;

    for (let i = 0; i < boundaries.length; i++) {
      if (totalProgress < boundaries[i] || i === boundaries.length - 1) {
        const phaseStart = i === 0 ? 0 : boundaries[i - 1];
        const progress = Math.min(1, (totalProgress - phaseStart) / durations[i]);
        return { phase: i + 1, progress };
      }
    }

    return null;
  }

  getBackArmAngle(aimAngle: number): number | null {
    const state = this.getAnimationState();
    if (!state) return null;
    
    const { phase, progress } = state;
    // Note: getBackHandTransform mirrors angles around π, and +Y is UP in world coords
    // When passed to getBackHandTransform(θ), hand position uses angle π-θ:
    // - Pass 0 → arm at π (horizontal backward)
    // - Pass -π/2 → arm at 3π/2, sin=-1 (pointing down, since +Y is up)
    // - Pass (π - aimAngle) → arm at aimAngle
    const downAngleInput = -Math.PI / 2; // Will result in arm pointing down
    let targetAngleInput = Math.PI - aimAngle; // Will result in arm at aimAngle
    
    // Ensure the arm continues rotating clockwise (decreasing angles) in phase 3
    // by subtracting 2π from target if needed
    if (targetAngleInput > downAngleInput) {
      targetAngleInput -= 2 * Math.PI;
    }
    
    switch (phase) {
      case 1:
        // Phase 1: Swing down from horizontal backward (0) to pointing down (-π/2)
        return downAngleInput * progress;
      
      case 2:
        // Phase 2: Hold at down position (rocket appears)
        return downAngleInput;
      
      case 3:
        // Phase 3: Swing forward from down (-π/2) to aim angle (π - aimAngle)
        return downAngleInput + (targetAngleInput - downAngleInput) * progress;
      
      case 4:
        // Phase 4: Hold at aim angle (rocket slides in)
        return targetAngleInput;
      
      case 5:
        // Phase 5: Return to original position (π - aimAngle) back to 0
        return targetAngleInput - targetAngleInput * progress;
      
      default:
        return null;
    }
  }

  getRocketTransform({
    playerTransform,
    aimAngle,
    launcher,
    weaponAbsTransform
  }: {
    playerTransform: EntityTransform;
    aimAngle: number;
    launcher: LaunchingWeapon;
    weaponAbsTransform: EntityTransform;
  }): EntityTransform | null {
    const state = this.getAnimationState();
    if (!state) return null;

    const { phase, progress } = state;
    
    // Rocket appears in phase 2 and onwards
    if (phase < 2) return null;
    
    const backArmAngle = this.getBackArmAngle(aimAngle);
    if (backArmAngle === null) return null;
    
    if (phase === 2 || phase === 3) {
      // Phase 2 & 3: Rocket is held by back hand, pointing in same direction as arm
      const backHandTransform = HumanFigure.getBackHandTransform(backArmAngle);
      const absoluteBackHand = playerTransform.applyTransform(backHandTransform);
      return new EntityTransform(
        absoluteBackHand.position,
        Math.PI - backArmAngle, // Actual arm angle (getBackHandTransform mirrors around π)
        playerTransform.facing
      );
    } else if (phase === 4) {
      // Phase 4: Rocket slides from back hand position to launcher muzzle
      const backHandTransform = HumanFigure.getBackHandTransform(backArmAngle);
      const absoluteBackHand = playerTransform.applyTransform(backHandTransform);
      
      const muzzleTransform = launcher.getMuzzleTransform(weaponAbsTransform);
      
      // Interpolate position from back hand to launcher muzzle
      const startX = absoluteBackHand.position.x;
      const startY = absoluteBackHand.position.y;
      const endX = muzzleTransform.position.x;
      const endY = muzzleTransform.position.y;
      
      return new EntityTransform(
        {
          x: startX + (endX - startX) * progress,
          y: startY + (endY - startY) * progress
        },
        aimAngle,
        playerTransform.facing
      );
    } else if (phase === 5) {
      // Phase 5: Rocket is loaded in launcher, render at launcher position
      const muzzleTransform = launcher.getMuzzleTransform(weaponAbsTransform);
      return new EntityTransform(
        muzzleTransform.position,
        aimAngle,
        playerTransform.facing
      );
    }
    
    // Should not reach here - all phases are handled above
    return null;
  }
}

