import { EntityTransform } from "../EntityTransform";
import { Arsenal } from "../Arsenal";
import { HumanFigure } from "../../figures/HumanFigure";

export class ReloadLauncherMovement {
  private isReloading: boolean = false;
  private reloadStartTime: number = 0;
  private reloadAnimationDuration: number = 0;

  // Reload animation phase durations (as fractions of total duration)
  private static readonly RELOAD_PHASE_1_DURATION = 0.2; // Arm swings down
  private static readonly RELOAD_PHASE_2_DURATION = 0.1; // Rocket appears
  private static readonly RELOAD_PHASE_3_DURATION = 0.25; // Arm + rocket swing forward
  private static readonly RELOAD_PHASE_4_DURATION = 0.3; // Rocket slides into launcher
  private static readonly RELOAD_PHASE_5_DURATION = 0.15; // Arm returns to original position

  startReload(duration: number): void {
    this.isReloading = true;
    this.reloadStartTime = Date.now();
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
    return Date.now() - this.reloadStartTime;
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
    
    // Calculate cumulative phase boundaries
    const phase1End = ReloadLauncherMovement.RELOAD_PHASE_1_DURATION;
    const phase2End = phase1End + ReloadLauncherMovement.RELOAD_PHASE_2_DURATION;
    const phase3End = phase2End + ReloadLauncherMovement.RELOAD_PHASE_3_DURATION;
    const phase4End = phase3End + ReloadLauncherMovement.RELOAD_PHASE_4_DURATION;
    const phase5End = phase4End + ReloadLauncherMovement.RELOAD_PHASE_5_DURATION;
    
    let phase = 0;
    let progress = 0;
    
    if (totalProgress < phase1End) {
      phase = 1;
      progress = totalProgress / ReloadLauncherMovement.RELOAD_PHASE_1_DURATION;
    } else if (totalProgress < phase2End) {
      phase = 2;
      progress = (totalProgress - phase1End) / ReloadLauncherMovement.RELOAD_PHASE_2_DURATION;
    } else if (totalProgress < phase3End) {
      phase = 3;
      progress = (totalProgress - phase2End) / ReloadLauncherMovement.RELOAD_PHASE_3_DURATION;
    } else if (totalProgress < phase4End) {
      phase = 4;
      progress = (totalProgress - phase3End) / ReloadLauncherMovement.RELOAD_PHASE_4_DURATION;
    } else {
      phase = 5;
      progress = (totalProgress - phase4End) / ReloadLauncherMovement.RELOAD_PHASE_5_DURATION;
    }
    
    return { phase, progress: Math.min(1, progress) };
  }

  getBackArmAngle(aimAngle: number): number | null {
    const state = this.getAnimationState();
    if (!state) return null;
    
    const { phase, progress } = state;
    // Note: getBackHandTransform adds π to these angles, and +Y is UP in world coords
    // When passed to getBackHandTransform(θ), hand position uses angle θ+π:
    // - Pass 0 → arm at π (horizontal backward)
    // - Pass π/2 → arm at 3π/2, sin=-1 (pointing down, since +Y is up)
    // - Pass (aimAngle - π) → arm at aimAngle
    const downAngleInput = Math.PI / 2; // Will result in arm pointing down
    let targetAngleInput = aimAngle - Math.PI; // Will result in arm at aimAngle
    
    // Ensure the arm continues rotating counterclockwise (increasing angles) in phase 3
    // by adding 2π to target if needed
    if (targetAngleInput < downAngleInput) {
      targetAngleInput += 2 * Math.PI;
    }
    
    switch (phase) {
      case 1:
        // Phase 1: Swing down from horizontal backward (0) to pointing down (π/2)
        return downAngleInput * progress;
      
      case 2:
        // Phase 2: Hold at down position (rocket appears)
        return downAngleInput;
      
      case 3:
        // Phase 3: Swing forward from down (π/2) to aim angle (aimAngle - π)
        return downAngleInput + (targetAngleInput - downAngleInput) * progress;
      
      case 4:
        // Phase 4: Hold at aim angle (rocket slides in)
        return targetAngleInput;
      
      case 5:
        // Phase 5: Return to original position (aimAngle - π) back to 0
        return targetAngleInput - targetAngleInput * progress;
      
      default:
        return null;
    }
  }

  getRocketTransform({
    playerTransform,
    aimAngle,
    arsenal,
    weaponTransform
  }: {
    playerTransform: EntityTransform;
    aimAngle: number;
    arsenal: Arsenal;
    weaponTransform: EntityTransform;
  }): EntityTransform | null {
    const state = this.getAnimationState();
    if (!state) return null;
    
    const { phase, progress } = state;
    const launcher = arsenal.heldLaunchingWeapon;
    
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
        backArmAngle + Math.PI, // Actual arm angle (getBackHandTransform adds π)
        playerTransform.facing
      );
    } else if (phase === 4) {
      // Phase 4: Rocket slides from back hand position to launcher muzzle
      const backHandTransform = HumanFigure.getBackHandTransform(backArmAngle);
      const absoluteBackHand = playerTransform.applyTransform(backHandTransform);
      
      const muzzleTransform = launcher.getMuzzleTransform(weaponTransform);
      
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
      const muzzleTransform = launcher.getMuzzleTransform(weaponTransform);
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

