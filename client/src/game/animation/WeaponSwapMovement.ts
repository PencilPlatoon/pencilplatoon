import { EntityTransform } from "@/game/types/EntityTransform";
import { Vector2 } from "@/game/types/Vector2";
import { HumanFigure } from "@/rendering/HumanFigure";
import { TimedAnimation } from "./TimedAnimation";

/**
 * Poses the swap between two guns:
 *  - 'change': the held gun swings up over the shoulder and behind the back, the
 *    guns exchange, then the next gun is drawn back out the same way to the aim.
 *  - 'pickup': the held gun is reached up and stowed behind the back, then the
 *    figure crouches and reaches an empty hand down to a gun lying on the ground,
 *    grabs it on contact, and stands back up lifting it to the aim.
 *
 * Both are a single arm swing through a low/high pose, so the machinery is shared
 * and only the keyframes and a couple of flags differ. Arm angles are the actual
 * angle of the swinging arm (0 = forward at aim), so the hand is
 * `HumanFigure.handAtAngle(armAngle)` and a hand-held gun points along it.
 */
export type WeaponSwapMode = "change" | "pickup";

/** Which gun, if any, is currently held in the swinging hand. */
export type SwapHandRole = "outgoing" | "incoming" | null;

interface SwapKeyframe {
  t: number; // normalized time in [0, 1]
  armAngle: number | null; // actual arm angle; null means "follow the current aim"
  crouch: number; // crouch depth in px
}

interface SwapProfile {
  duration: number; // ms
  swapAt: number; // t at which the hand takes hold of the incoming gun
  stowEnd: number; // t at which the outgoing gun is fully stowed (and then hidden)
  groundIncoming: boolean; // incoming gun waits on the ground until the grab
  keyframes: readonly SwapKeyframe[];
}

// Up and behind the body, over the shoulder — the "gun behind the back" pose,
// reached by swinging the arm upward.
const OVER_SHOULDER = Math.PI * 0.8;
// Straight down — reaching to the ground for a gun on the floor.
const REACH_DOWN = -Math.PI / 2;
const CROUCH_DEPTH = 10;

const PROFILES: Record<WeaponSwapMode, SwapProfile> = {
  change: {
    duration: 420,
    swapAt: 0.5,
    stowEnd: 0.5, // the outgoing gun swings over the shoulder right up to the exchange
    groundIncoming: false,
    keyframes: [
      { t: 0, armAngle: null, crouch: 0 },
      { t: 0.5, armAngle: OVER_SHOULDER, crouch: 0 },
      { t: 1, armAngle: null, crouch: 0 },
    ],
  },
  pickup: {
    duration: 720,
    swapAt: 0.5,
    stowEnd: 0.28, // the outgoing gun is behind the back before the hand reaches down
    groundIncoming: true,
    keyframes: [
      // Reach up to stow the current gun behind the back (standing tall)...
      { t: 0, armAngle: null, crouch: 0 },
      { t: 0.28, armAngle: OVER_SHOULDER, crouch: 0 },
      // ...then crouch down and reach to the ground for the new gun.
      { t: 0.5, armAngle: REACH_DOWN, crouch: CROUCH_DEPTH },
      { t: 1, armAngle: null, crouch: 0 },
    ],
  },
};

const smoothstep = (x: number): number => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Interpolate between two angles along the shortest arc. */
const lerpAngle = (from: number, to: number, t: number): number =>
  from + Math.atan2(Math.sin(to - from), Math.cos(to - from)) * t;

/**
 * World direction a weapon's barrel points for a given render transform. The SVG is
 * drawn rotated by `rotation` and mirrored by `facing`, so the barrel (local +x) ends
 * up along this angle. It is its own inverse: `barrelAngle(barrelAngle(r, f), f) === r`.
 */
const barrelAngle = (rotation: number, facing: number): number =>
  facing === 1 ? rotation : Math.PI - rotation;

export class WeaponSwapMovement extends TimedAnimation {
  private profile: SwapProfile | null = null;

  start(mode: WeaponSwapMode): void {
    this.profile = PROFILES[mode];
    this.startAnimation(this.profile.duration);
  }

  stop(): void {
    this.stopAnimation();
    this.profile = null;
  }

  /** Player-relative position for both hands as they carry the gun through the swing. */
  getActiveHandRel(aim: number): Vector2 {
    return HumanFigure.handAtAngle(this.sample(aim).armAngle);
  }

  /** How far to lower the torso for the crouch (0 when standing). */
  getCrouchOffset(): number {
    return this.profile === null ? 0 : this.sample(0).crouch;
  }

  /**
   * Which gun the hand holds right now: the outgoing gun while it is being stowed,
   * the incoming gun once it has been grabbed, or none while the hand reaches
   * empty for a gun still on the ground.
   */
  getHandRole(): SwapHandRole {
    if (this.profile === null) return null;
    const t = this.getProgress();
    if (t >= this.profile.swapAt) return "incoming";
    if (t >= this.profile.stowEnd) return null;
    return "outgoing";
  }

  /** Player-relative pose of the gun held in the hand (points along the arm), or null while empty. */
  getHandWeaponRelTransform(aim: number): EntityTransform | null {
    if (this.getHandRole() === null) return null;
    const { armAngle } = this.sample(aim);
    return new EntityTransform(HumanFigure.handAtAngle(armAngle), armAngle, 1);
  }

  /**
   * Absolute transform for a gun picked up off the ground, blended from where it lay
   * (blend 0) into the lifting hand at the aim (blend 1): position eases from the
   * ground spot to the hand, and the barrel rotates along the shortest arc so the gun
   * turns smoothly into firing position instead of snapping. Null when this swap has
   * no ground gun (a weapon change) or is not active.
   *
   * Mirrors ReloadLauncherMovement.getRocketTransform: the movement owns the pose
   * math, given the holder's transform.
   */
  getIncomingGroundTransform(
    playerTransform: EntityTransform,
    groundTransform: EntityTransform,
    aim: number
  ): EntityTransform | null {
    const blend = this.getGroundLiftBlend();
    if (blend === null) return null;

    const facing = playerTransform.facing;
    const beta = lerpAngle(
      barrelAngle(groundTransform.rotation, groundTransform.facing),
      barrelAngle(aim, facing),
      blend
    );

    const handAbs = playerTransform.applyTransform(
      new EntityTransform(this.getActiveHandRel(aim), 0, 1)
    ).position;
    const position = {
      x: lerp(groundTransform.position.x, handAbs.x, blend),
      y: lerp(groundTransform.position.y, handAbs.y, blend),
    };
    return new EntityTransform(position, barrelAngle(beta, facing), facing);
  }

  /**
   * How far a gun picked up off the ground has travelled from where it lay into the
   * lifting hand: 0 while it still rests on the ground during the reach, easing to 1
   * as it is raised to the aim. Null when this swap has no ground gun (a weapon change).
   */
  private getGroundLiftBlend(): number | null {
    if (this.profile === null || !this.profile.groundIncoming) return null;
    const t = this.getProgress();
    if (t < this.profile.swapAt) return 0;
    return smoothstep((t - this.profile.swapAt) / (1 - this.profile.swapAt));
  }

  /** Interpolate arm angle and crouch depth at the current progress. */
  private sample(aim: number): { armAngle: number; crouch: number } {
    const keyframes = this.profile!.keyframes;
    const t = this.getProgress();
    const resolve = (kf: SwapKeyframe) => (kf.armAngle ?? aim);

    for (let i = 0; i < keyframes.length - 1; i++) {
      const next = keyframes[i + 1];
      if (t <= next.t) {
        const curr = keyframes[i];
        const span = next.t - curr.t;
        const s = smoothstep(span === 0 ? 0 : (t - curr.t) / span);
        return {
          armAngle: lerp(resolve(curr), resolve(next), s),
          crouch: lerp(curr.crouch, next.crouch, s),
        };
      }
    }

    const last = keyframes[keyframes.length - 1];
    return { armAngle: resolve(last), crouch: last.crouch };
  }
}
