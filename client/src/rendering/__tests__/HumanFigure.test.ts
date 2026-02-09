import { describe, it, expect } from "vitest";
import { HumanFigure } from "@/rendering/HumanFigure";
import { EntityTransform } from "@/game/types/EntityTransform";

describe("HumanFigure", () => {
  describe("getWidth / getHeight", () => {
    it("returns positive dimensions", () => {
      expect(HumanFigure.getWidth()).toBeGreaterThan(0);
      expect(HumanFigure.getHeight()).toBeGreaterThan(0);
    });

    it("matches static constants", () => {
      expect(HumanFigure.getWidth()).toBe(HumanFigure.FIGURE_WIDTH);
      expect(HumanFigure.getHeight()).toBe(HumanFigure.FIGURE_HEIGHT);
    });
  });

  describe("getForwardHandTransform", () => {
    it("at aimAngle 0, hand is forward at arm Y offset", () => {
      const t = HumanFigure.getForwardHandTransform(0);
      const reach = HumanFigure.ARM_LENGTH * 0.85;
      expect(t.position.x).toBeCloseTo(HumanFigure.ARM_X_OFFSET + reach);
      expect(t.position.y).toBeCloseTo(HumanFigure.ARM_Y_OFFSET);
      expect(t.rotation).toBeCloseTo(0);
    });

    it("at aimAngle π/2, hand is above shoulder", () => {
      const t = HumanFigure.getForwardHandTransform(Math.PI / 2);
      expect(t.position.x).toBeCloseTo(HumanFigure.ARM_X_OFFSET, 0);
      expect(t.position.y).toBeGreaterThan(HumanFigure.ARM_Y_OFFSET);
      expect(t.rotation).toBeCloseTo(Math.PI / 2);
    });

    it("at negative aimAngle, hand is below shoulder", () => {
      const t = HumanFigure.getForwardHandTransform(-Math.PI / 4);
      expect(t.position.y).toBeLessThan(HumanFigure.ARM_Y_OFFSET);
    });
  });

  describe("getBackHandTransform", () => {
    it("at aimAngle 0, hand is backward (negative x)", () => {
      const t = HumanFigure.getBackHandTransform(0);
      // actual angle = π, so cos(π) = -1 → hand is behind
      expect(t.position.x).toBeLessThan(0);
      expect(t.rotation).toBeCloseTo(Math.PI);
    });

    it("at aimAngle π/6, hand is up and backward", () => {
      const t = HumanFigure.getBackHandTransform(Math.PI / 6);
      // actual angle = π - π/6 = 5π/6
      expect(t.rotation).toBeCloseTo(5 * Math.PI / 6);
      expect(t.position.y).toBeGreaterThan(HumanFigure.ARM_Y_OFFSET);
    });
  });

  describe("getBackHandRestingTransform", () => {
    it("positions hand down and back", () => {
      const t = HumanFigure.getBackHandRestingTransform();
      expect(t.position.x).toBeLessThan(0); // backward
      expect(t.position.y).toBeLessThan(HumanFigure.ARM_Y_OFFSET); // below shoulder
    });
  });

  describe("updateWalkCycle", () => {
    it("returns 0 when no movement", () => {
      expect(HumanFigure.updateWalkCycle(100, 100, 0)).toBe(0);
    });

    it("advances phase proportionally to distance", () => {
      const phase = HumanFigure.updateWalkCycle(0, HumanFigure.PX_PER_HALF_CYCLE, 0);
      expect(phase).toBeCloseTo(Math.PI);
    });

    it("wraps around at 2π", () => {
      const phase = HumanFigure.updateWalkCycle(0, HumanFigure.PX_PER_HALF_CYCLE * 2, 0);
      // 2 half-cycles = 2π → wraps to 0
      expect(phase).toBeCloseTo(0, 4);
    });

    it("accumulates from current phase", () => {
      const initial = Math.PI / 2;
      const phase = HumanFigure.updateWalkCycle(0, HumanFigure.PX_PER_HALF_CYCLE / 2, initial);
      // movement adds π/2, so total = π
      expect(phase).toBeCloseTo(Math.PI);
    });

    it("works with backward movement (negative dx)", () => {
      const phase = HumanFigure.updateWalkCycle(10, 0, 0);
      // |dx| = 10, same as forward
      expect(phase).toBeGreaterThan(0);
    });
  });

  describe("calculateTwoBarJointPosition", () => {
    it("places joint at midpoint when target is at max reach", () => {
      const result = HumanFigure.calculateTwoBarJointPosition({
        startPos: { x: 0, y: 0 },
        endPos: { x: 23.999, y: 0 }, // nearly max reach (12+12=24)
        length1: 12,
        length2: 12,
        bendMultiplier: 1,
      });
      // Joint should be near the midpoint along x with slight perpendicular offset
      expect(result.x).toBeCloseTo(12, 0);
    });

    it("respects bend direction", () => {
      const upBend = HumanFigure.calculateTwoBarJointPosition({
        startPos: { x: 0, y: 0 },
        endPos: { x: 20, y: 0 },
        length1: 12,
        length2: 12,
        bendMultiplier: 1,
      });
      const downBend = HumanFigure.calculateTwoBarJointPosition({
        startPos: { x: 0, y: 0 },
        endPos: { x: 20, y: 0 },
        length1: 12,
        length2: 12,
        bendMultiplier: -1,
      });
      // Y values should be opposite
      expect(upBend.y).toBeCloseTo(-downBend.y);
    });

    it("handles target beyond max reach by clamping", () => {
      const result = HumanFigure.calculateTwoBarJointPosition({
        startPos: { x: 0, y: 0 },
        endPos: { x: 100, y: 0 }, // way beyond reach
        length1: 12,
        length2: 12,
        bendMultiplier: 1,
      });
      // Should still produce a valid joint position
      expect(Number.isFinite(result.x)).toBe(true);
      expect(Number.isFinite(result.y)).toBe(true);
    });
  });

  describe("getHandPositionForWeapon", () => {
    it("returns anchor position when holdRatio matches primaryHoldRatio", () => {
      const weaponType = {
        name: "test",
        size: 40,
        svgPath: "",
        primaryHoldRatioPosition: { x: 0.5, y: 0.5 },
        secondaryHoldRatioPosition: null,
        damage: 0,
        fireInterval: 0,
        bulletSpeed: 0,
        bulletSize: 0,
        capacity: 0,
        autoFiringType: "auto" as const,
      };
      const weaponTransform = new EntityTransform({ x: 10, y: 20 }, 0, 1);
      const result = HumanFigure.getHandPositionForWeapon(
        weaponTransform,
        weaponType,
        10, // weaponHeight
        weaponType.primaryHoldRatioPosition
      );
      // When holdRatio == primaryHoldRatio, offsets are 0 → position = weaponTransform.position
      expect(result.x).toBeCloseTo(10);
      expect(result.y).toBeCloseTo(20);
    });

    it("offsets position based on hold ratio difference", () => {
      const weaponType = {
        name: "test",
        size: 40,
        svgPath: "",
        primaryHoldRatioPosition: { x: 0.3, y: 0.5 },
        secondaryHoldRatioPosition: { x: 0.7, y: 0.5 },
        damage: 0,
        fireInterval: 0,
        bulletSpeed: 0,
        bulletSize: 0,
        capacity: 0,
        autoFiringType: "auto" as const,
      };
      const weaponTransform = new EntityTransform({ x: 0, y: 0 }, 0, 1);
      const result = HumanFigure.getHandPositionForWeapon(
        weaponTransform,
        weaponType,
        10,
        weaponType.secondaryHoldRatioPosition!
      );
      // x offset: (0.7 - 0.3) * 40 = 16, cos(0) = 1 → x = 0 + 16 = 16
      // y offset: (0.5 - 0.5) * 10 = 0
      expect(result.x).toBeCloseTo(16);
      expect(result.y).toBeCloseTo(0);
    });
  });
});
