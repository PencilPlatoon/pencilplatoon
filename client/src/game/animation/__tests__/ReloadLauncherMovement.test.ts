import { describe, it, expect, beforeEach } from "vitest";
import { ReloadLauncherMovement } from "../ReloadLauncherMovement";
import { EntityTransform } from "../../types/EntityTransform";
import { BoundingBox } from "../../types/BoundingBox";

describe("ReloadLauncherMovement", () => {
  let now: number;
  let movement: ReloadLauncherMovement;
  const DURATION = 1000;

  // Phase boundaries at duration=1000:
  // Phase 1: 0-200ms (0.2)
  // Phase 2: 200-300ms (0.1)
  // Phase 3: 300-550ms (0.25)
  // Phase 4: 550-850ms (0.3)
  // Phase 5: 850-1000ms (0.15)

  beforeEach(() => {
    now = 1000;
    movement = new ReloadLauncherMovement(() => now);
  });

  describe("initial state", () => {
    it("is not reloading", () => {
      expect(movement.isInReloadState()).toBe(false);
    });

    it("has zero elapsed time", () => {
      expect(movement.getElapsedTime()).toBe(0);
    });

    it("is not complete", () => {
      expect(movement.isReloadComplete()).toBe(false);
    });
  });

  describe("startReload", () => {
    it("enters reload state", () => {
      movement.startReload(DURATION);
      expect(movement.isInReloadState()).toBe(true);
    });
  });

  describe("getElapsedTime", () => {
    it("returns time since reload started", () => {
      movement.startReload(DURATION);
      now = 1500;
      expect(movement.getElapsedTime()).toBe(500);
    });

    it("returns 0 when not reloading", () => {
      expect(movement.getElapsedTime()).toBe(0);
    });
  });

  describe("isReloadComplete", () => {
    it("returns false during reload", () => {
      movement.startReload(DURATION);
      now = 1500;
      expect(movement.isReloadComplete()).toBe(false);
    });

    it("returns true when elapsed >= duration", () => {
      movement.startReload(DURATION);
      now = 2000;
      expect(movement.isReloadComplete()).toBe(true);
    });
  });

  describe("stopReload", () => {
    it("exits reload state", () => {
      movement.startReload(DURATION);
      movement.stopReload();
      expect(movement.isInReloadState()).toBe(false);
    });
  });

  describe("reset", () => {
    it("resets to initial state", () => {
      movement.startReload(DURATION);
      movement.reset();
      expect(movement.isInReloadState()).toBe(false);
    });
  });

  describe("getBackArmAngle - 5 phases", () => {
    it("returns null when not reloading", () => {
      expect(movement.getBackArmAngle(0)).toBeNull();
    });

    it("phase 1: swings from 0 down to -PI/2", () => {
      movement.startReload(DURATION);
      // Start of phase 1 (progress=0)
      expect(movement.getBackArmAngle(0)).toBeCloseTo(0);
      // Middle of phase 1: t=100ms, totalProgress=0.1, phase1Progress=0.5
      now = 1100;
      expect(movement.getBackArmAngle(0)).toBeCloseTo(-Math.PI / 4);
      // End of phase 1: t=200ms
      now = 1199;
      const angle = movement.getBackArmAngle(0)!;
      expect(angle).toBeLessThan(-Math.PI / 4);
    });

    it("phase 2: holds at down position (-PI/2)", () => {
      movement.startReload(DURATION);
      now = 1250; // midway through phase 2
      expect(movement.getBackArmAngle(0)).toBeCloseTo(-Math.PI / 2);
    });

    it("phase 3: swings from down to aim angle", () => {
      movement.startReload(DURATION);
      now = 1300; // start of phase 3
      const startAngle = movement.getBackArmAngle(0)!;
      now = 1425; // midway through phase 3
      const midAngle = movement.getBackArmAngle(0)!;
      expect(midAngle).not.toBeCloseTo(startAngle);
    });

    it("phase 4: holds at aim angle", () => {
      movement.startReload(DURATION);
      now = 1600; // middle of phase 4
      const angle1 = movement.getBackArmAngle(0)!;
      now = 1700;
      const angle2 = movement.getBackArmAngle(0)!;
      expect(angle1).toBeCloseTo(angle2, 1);
    });

    it("phase 5: returns toward 0", () => {
      movement.startReload(DURATION);
      now = 1925; // midway through phase 5
      const midAngle = movement.getBackArmAngle(0)!;
      now = 1999; // near end of phase 5
      const endAngle = movement.getBackArmAngle(0)!;
      // Should be approaching 0
      expect(Math.abs(endAngle)).toBeLessThan(Math.abs(midAngle) + 0.5);
    });
  });

  describe("getRocketTransform", () => {
    const playerTransform = new EntityTransform({ x: 100, y: 300 }, 0, 1);
    const weaponAbsTransform = new EntityTransform({ x: 120, y: 300 }, 0, 1);
    const makeLauncher = () => ({
      getMuzzleTransform: (t: EntityTransform) =>
        new EntityTransform(
          { x: t.position.x + 25, y: t.position.y },
          t.rotation,
          t.facing
        ),
      bounds: new BoundingBox(50, 10, { x: 0.5, y: 0.5 }),
    });

    it("returns null when not reloading", () => {
      expect(
        movement.getRocketTransform({
          playerTransform,
          aimAngle: 0,
          launcher: makeLauncher() as any,
          weaponAbsTransform,
        })
      ).toBeNull();
    });

    it("returns null in phase 1 (rocket not yet visible)", () => {
      movement.startReload(DURATION);
      now = 1100; // phase 1
      expect(
        movement.getRocketTransform({
          playerTransform,
          aimAngle: 0,
          launcher: makeLauncher() as any,
          weaponAbsTransform,
        })
      ).toBeNull();
    });

    it("returns transform in phase 2 (rocket appears at back hand)", () => {
      movement.startReload(DURATION);
      now = 1250; // phase 2
      const result = movement.getRocketTransform({
        playerTransform,
        aimAngle: 0,
        launcher: makeLauncher() as any,
        weaponAbsTransform,
      });
      expect(result).not.toBeNull();
    });

    it("returns transform in phase 3 (rocket follows hand)", () => {
      movement.startReload(DURATION);
      now = 1400; // phase 3
      const result = movement.getRocketTransform({
        playerTransform,
        aimAngle: 0,
        launcher: makeLauncher() as any,
        weaponAbsTransform,
      });
      expect(result).not.toBeNull();
    });

    it("interpolates position in phase 4 (slides into launcher)", () => {
      movement.startReload(DURATION);
      const launcher = makeLauncher() as any;

      now = 1550; // start of phase 4
      const startResult = movement.getRocketTransform({
        playerTransform,
        aimAngle: 0,
        launcher,
        weaponAbsTransform,
      });

      now = 1700; // middle of phase 4
      const midResult = movement.getRocketTransform({
        playerTransform,
        aimAngle: 0,
        launcher,
        weaponAbsTransform,
      });

      expect(startResult).not.toBeNull();
      expect(midResult).not.toBeNull();
      // Position should be different (interpolating)
      expect(midResult!.position.x).not.toBeCloseTo(startResult!.position.x, 0);
    });

    it("returns muzzle transform in phase 5 (rocket loaded)", () => {
      movement.startReload(DURATION);
      now = 1925; // phase 5
      const result = movement.getRocketTransform({
        playerTransform,
        aimAngle: 0,
        launcher: makeLauncher() as any,
        weaponAbsTransform,
      });
      expect(result).not.toBeNull();
      // In phase 5, rocket should be at muzzle position
      // muzzle = weaponAbsTransform.x + 25 = 145
      expect(result!.position.x).toBeCloseTo(145);
    });
  });
});
