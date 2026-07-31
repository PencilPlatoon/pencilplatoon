import { describe, it, expect, beforeEach } from "vitest";
import { ThrowGrenadeMovement } from "@/game/animation/ThrowGrenadeMovement";
import { HumanFigure } from "@/rendering/HumanFigure";

describe("ThrowGrenadeMovement", () => {
  const START = 1000;
  const DURATION = 300;
  const SPEED = 1000;
  let now: number;
  let movement: ThrowGrenadeMovement;

  beforeEach(() => {
    now = START;
    movement = new ThrowGrenadeMovement(() => now);
  });

  /** Fraction 0..1 through the throw → wall-clock time. */
  const atProgress = (p: number) => {
    now = START + DURATION * p;
  };

  describe("initial state", () => {
    it("is not in throw state", () => {
      expect(movement.isInThrowState()).toBe(false);
    });

    it("has zero progress", () => {
      expect(movement.getThrowProgress()).toBe(0);
    });

    it("is not complete", () => {
      expect(movement.isThrowComplete()).toBe(false);
    });
  });

  describe("startThrow", () => {
    it("enters throw state", () => {
      movement.startThrow(0, SPEED);
      expect(movement.isInThrowState()).toBe(true);
    });

    it("freezes the launch aim", () => {
      movement.startThrow(0.5, SPEED);
      expect(movement.getLaunchAim()).toBe(0.5);
    });

    it("starts with progress 1 (beginning of throw)", () => {
      movement.startThrow(0, SPEED);
      expect(movement.getThrowProgress()).toBe(1);
    });
  });

  describe("getThrowProgress", () => {
    it("decreases from 1 to 0 over duration", () => {
      movement.startThrow(0, SPEED, DURATION);
      expect(movement.getThrowProgress()).toBe(1);

      atProgress(0.5);
      expect(movement.getThrowProgress()).toBeCloseTo(0.5);

      atProgress(1);
      expect(movement.getThrowProgress()).toBe(0);
    });

    it("clamps to 0 after duration", () => {
      movement.startThrow(0, SPEED, DURATION);
      now = START + 2000;
      expect(movement.getThrowProgress()).toBe(0);
    });
  });

  describe("isThrowComplete", () => {
    it("returns false before throw starts", () => {
      expect(movement.isThrowComplete()).toBe(false);
    });

    it("returns false during throw", () => {
      movement.startThrow(0, SPEED, DURATION);
      atProgress(0.33);
      expect(movement.isThrowComplete()).toBe(false);
    });

    it("returns true when progress reaches 0", () => {
      movement.startThrow(0, SPEED, DURATION);
      atProgress(1);
      expect(movement.isThrowComplete()).toBe(true);
    });
  });

  describe("stopThrow / reset", () => {
    it("stopThrow exits throw state", () => {
      movement.startThrow(0, SPEED);
      movement.stopThrow();
      expect(movement.isInThrowState()).toBe(false);
    });

    it("reset returns to initial state", () => {
      movement.startThrow(0, SPEED);
      movement.reset();
      expect(movement.isInThrowState()).toBe(false);
      expect(movement.getThrowProgress()).toBe(0);
    });
  });

  describe("getLaunchVelocity", () => {
    it("points along the aim at launch speed, facing right", () => {
      movement.startThrow(0, SPEED);
      const v = movement.getLaunchVelocity(1);
      expect(v.x).toBeCloseTo(SPEED);
      expect(v.y).toBeCloseTo(0);
    });

    it("mirrors x when facing left", () => {
      movement.startThrow(0, SPEED);
      const v = movement.getLaunchVelocity(-1);
      expect(v.x).toBeCloseTo(-SPEED);
    });

    it("splits into x/y for an angled throw", () => {
      movement.startThrow(Math.PI / 4, SPEED);
      const v = movement.getLaunchVelocity(1);
      expect(v.x).toBeCloseTo((SPEED * Math.SQRT2) / 2);
      expect(v.y).toBeCloseTo((SPEED * Math.SQRT2) / 2);
    });
  });

  describe("holdRel", () => {
    it("cocks the grenade one reach behind the shoulder, opposite the aim", () => {
      const shoulder = { x: HumanFigure.ARM_X_OFFSET, y: HumanFigure.ARM_Y_OFFSET };
      const reach = HumanFigure.ARM_LENGTH * 0.85;
      const hold = ThrowGrenadeMovement.holdRel(Math.PI / 6);
      // One reach from the shoulder...
      expect(Math.hypot(hold.x - shoulder.x, hold.y - shoulder.y)).toBeCloseTo(reach);
      // ...on the opposite side from the aim (behind and, for an up-aim, below).
      expect(hold.x).toBeLessThan(shoulder.x);
      expect(hold.y).toBeLessThan(shoulder.y);
    });
  });

  describe("getReleaseRelTransform", () => {
    it("releases high — above the front hand — at arm's reach", () => {
      const shoulder = { x: HumanFigure.ARM_X_OFFSET, y: HumanFigure.ARM_Y_OFFSET };
      const reach = HumanFigure.ARM_LENGTH * 0.85;
      const aim = 0.3;
      const release = movement.getReleaseRelTransform(aim);
      const frontHand = HumanFigure.getForwardHandTransform(aim).position;
      // Overhand: the release sits higher than the extended front hand...
      expect(release.position.y).toBeGreaterThan(frontHand.y);
      // ...at arm's reach from the shoulder, aligned with the launch direction.
      expect(Math.hypot(release.position.x - shoulder.x, release.position.y - shoulder.y)).toBeCloseTo(reach);
      expect(release.rotation).toBeCloseTo(aim);
    });
  });

  describe("overhand swing", () => {
    // Sample the grenade's relative position at a given fraction through the throw.
    const grenadeAt = (p: number) => {
      atProgress(p);
      return movement.getGrenadeRelTransform().position;
    };

    // Finite-difference on-screen speed of the grenade around a fraction p.
    const speedAround = (p: number, halfWindowMs = 0.05) => {
      const before = grenadeAt(p - halfWindowMs / DURATION);
      const after = grenadeAt(p + halfWindowMs / DURATION);
      const dt = (2 * halfWindowMs) / 1000;
      return Math.hypot(after.x - before.x, after.y - before.y) / dt;
    };

    it("ends exactly at the release position", () => {
      movement.startThrow(0.4, SPEED, DURATION);
      const release = movement.getReleaseRelTransform(0.4).position;
      const end = grenadeAt(1);
      expect(end.x).toBeCloseTo(release.x, 3);
      expect(end.y).toBeCloseTo(release.y, 3);
    });

    it("starts exactly at the neutral hold position (no snap to body center)", () => {
      movement.startThrow(0.3, SPEED, DURATION);
      const hold = ThrowGrenadeMovement.holdRel(0.3);
      const start = grenadeAt(0);
      expect(start.x).toBeCloseTo(hold.x, 3);
      expect(start.y).toBeCloseTo(hold.y, 3);
    });

    it("keeps the hand at arm's reach throughout the swing (a real arm arc)", () => {
      movement.startThrow(Math.PI / 4, SPEED, DURATION);
      const shoulder = { x: HumanFigure.ARM_X_OFFSET, y: HumanFigure.ARM_Y_OFFSET };
      const reach = HumanFigure.ARM_LENGTH * 0.85;
      for (let p = 0; p <= 1; p += 0.05) {
        const pos = grenadeAt(p);
        expect(Math.hypot(pos.x - shoulder.x, pos.y - shoulder.y)).toBeCloseTo(reach);
      }
    });

    it("reaches the launch speed at release (speed continuity)", () => {
      movement.startThrow(0, SPEED, DURATION);
      // Sample just before release; the on-screen speed converges to launch speed.
      const speed = speedAround(1 - 0.05 / DURATION, 0.02);
      expect(speed).toBeGreaterThan(SPEED * 0.95);
      expect(speed).toBeLessThan(SPEED * 1.05);
    });

    it("is nearly still during the early coil (the snap comes late)", () => {
      movement.startThrow(0, SPEED, DURATION);
      const early = speedAround(0.1);
      expect(early).toBeLessThan(SPEED * 0.25);
    });

    it("moves in the launch direction at release (angle continuity)", () => {
      const aim = Math.PI / 4;
      movement.startThrow(aim, SPEED, DURATION);
      const before = grenadeAt(1 - 0.05 / DURATION);
      const after = grenadeAt(1);
      const angle = Math.atan2(after.y - before.y, after.x - before.x);
      expect(angle).toBeCloseTo(aim, 1);
    });

    it("gives soft throws a gentler, more visible coil than hard throws", () => {
      // The coil-back distance is ~constant, but the ease differs: by the midpoint
      // a soft throw is already swinging out while a hard throw is still coiled and
      // snaps only at the very end. Compare distance travelled from the coil start.
      const travelledByMidpoint = (speed: number) => {
        now = START; // start the throw from t=0 so the animation clock is fresh
        movement.startThrow(0, speed, DURATION);
        const start = grenadeAt(0);
        const mid = grenadeAt(0.5);
        return Math.abs(mid.x - start.x);
      };

      expect(travelledByMidpoint(200)).toBeGreaterThan(travelledByMidpoint(SPEED));
    });
  });
});
