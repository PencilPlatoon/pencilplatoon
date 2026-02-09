import { describe, it, expect, beforeEach } from "vitest";
import { ThrowGrenadeMovement } from "../ThrowGrenadeMovement";

describe("ThrowGrenadeMovement", () => {
  let now: number;
  let movement: ThrowGrenadeMovement;

  beforeEach(() => {
    now = 1000;
    movement = new ThrowGrenadeMovement(() => now);
  });

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
      movement.startThrow();
      expect(movement.isInThrowState()).toBe(true);
    });

    it("starts with progress 1 (beginning of throw)", () => {
      movement.startThrow();
      expect(movement.getThrowProgress()).toBe(1);
    });
  });

  describe("getThrowProgress", () => {
    it("decreases from 1 to 0 over duration", () => {
      movement.startThrow(300);
      expect(movement.getThrowProgress()).toBe(1);

      now = 1150; // 50% through
      expect(movement.getThrowProgress()).toBeCloseTo(0.5);

      now = 1300; // 100% through
      expect(movement.getThrowProgress()).toBe(0);
    });

    it("clamps to 0 after duration", () => {
      movement.startThrow(300);
      now = 2000;
      expect(movement.getThrowProgress()).toBe(0);
    });

    it("uses custom duration", () => {
      movement.startThrow(600);
      now = 1300; // 50% of 600ms
      expect(movement.getThrowProgress()).toBeCloseTo(0.5);
    });
  });

  describe("isThrowComplete", () => {
    it("returns false before throw starts", () => {
      expect(movement.isThrowComplete()).toBe(false);
    });

    it("returns false during throw", () => {
      movement.startThrow(300);
      now = 1100;
      expect(movement.isThrowComplete()).toBe(false);
    });

    it("returns true when progress reaches 0", () => {
      movement.startThrow(300);
      now = 1300;
      expect(movement.isThrowComplete()).toBe(true);
    });
  });

  describe("stopThrow", () => {
    it("exits throw state", () => {
      movement.startThrow();
      movement.stopThrow();
      expect(movement.isInThrowState()).toBe(false);
    });
  });

  describe("reset", () => {
    it("resets to initial state", () => {
      movement.startThrow();
      movement.reset();
      expect(movement.isInThrowState()).toBe(false);
      expect(movement.getThrowProgress()).toBe(0);
    });
  });

  describe("getBackArmAngle", () => {
    it("returns aimAngle when not throwing", () => {
      const aimAngle = 0.5;
      expect(movement.getBackArmAngle(aimAngle)).toBe(aimAngle);
    });

    it("returns aimAngle at start of throw (progress=1, throwProgress=0)", () => {
      movement.startThrow(300);
      // throwProgress = 1 - getThrowProgress() = 1 - 1 = 0
      // angle = aimAngle + PI*0.3*0 = aimAngle
      expect(movement.getBackArmAngle(0.5)).toBeCloseTo(0.5);
    });

    it("returns aimAngle + PI*0.3 at end of throw", () => {
      movement.startThrow(300);
      now = 1300; // progress = 0, throwProgress = 1
      expect(movement.getBackArmAngle(0.5)).toBeCloseTo(0.5 + Math.PI * 0.3);
    });

    it("interpolates during throw", () => {
      movement.startThrow(300);
      now = 1150; // progress = 0.5, throwProgress = 0.5
      expect(movement.getBackArmAngle(0)).toBeCloseTo(Math.PI * 0.3 * 0.5);
    });
  });

  describe("getThrowCycle", () => {
    it("returns same value as getThrowProgress", () => {
      movement.startThrow(300);
      now = 1150;
      expect(movement.getThrowCycle()).toBe(movement.getThrowProgress());
    });
  });
});
