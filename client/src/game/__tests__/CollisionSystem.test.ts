import { describe, it, expect } from "vitest";
import { CollisionSystem } from "../CollisionSystem";
import { AbsoluteBoundingBox } from "../BoundingBox";

// Y-up coordinate system: upperLeft.y > lowerRight.y
function makeRect(left: number, bottom: number, right: number, top: number): AbsoluteBoundingBox {
  return {
    upperLeft: { x: left, y: top },
    lowerRight: { x: right, y: bottom },
  };
}

describe("CollisionSystem", () => {
  const cs = new CollisionSystem();

  describe("checkCollision", () => {
    it("detects overlapping rectangles", () => {
      const a = makeRect(0, 0, 10, 10);
      const b = makeRect(5, 5, 15, 15);
      expect(cs.checkCollision(a, b)).toBe(true);
    });

    it("returns false for non-overlapping rectangles", () => {
      const a = makeRect(0, 0, 10, 10);
      const b = makeRect(20, 20, 30, 30);
      expect(cs.checkCollision(a, b)).toBe(false);
    });

    it("returns false for touching edges (no overlap)", () => {
      const a = makeRect(0, 0, 10, 10);
      const b = makeRect(10, 0, 20, 10);
      expect(cs.checkCollision(a, b)).toBe(false);
    });

    it("detects containment", () => {
      const outer = makeRect(0, 0, 100, 100);
      const inner = makeRect(20, 20, 40, 40);
      expect(cs.checkCollision(outer, inner)).toBe(true);
      expect(cs.checkCollision(inner, outer)).toBe(true);
    });
  });

  describe("checkPointInRect", () => {
    const rect = makeRect(10, 10, 50, 50);

    it("returns true for point inside", () => {
      expect(cs.checkPointInRect({ x: 30, y: 30 }, rect)).toBe(true);
    });

    it("returns true for point on edge", () => {
      expect(cs.checkPointInRect({ x: 10, y: 30 }, rect)).toBe(true);
    });

    it("returns false for point outside", () => {
      expect(cs.checkPointInRect({ x: 0, y: 0 }, rect)).toBe(false);
      expect(cs.checkPointInRect({ x: 60, y: 30 }, rect)).toBe(false);
    });
  });

  describe("checkLineIntersectsRect", () => {
    const rect = makeRect(10, 10, 50, 50);

    it("detects line passing through rect", () => {
      expect(cs.checkLineIntersectsRect({ x: 0, y: 30 }, { x: 60, y: 30 }, rect)).toBe(true);
    });

    it("detects line starting inside rect", () => {
      expect(cs.checkLineIntersectsRect({ x: 30, y: 30 }, { x: 100, y: 30 }, rect)).toBe(true);
    });

    it("detects line ending inside rect", () => {
      expect(cs.checkLineIntersectsRect({ x: 0, y: 30 }, { x: 30, y: 30 }, rect)).toBe(true);
    });

    it("returns false for line completely outside", () => {
      expect(cs.checkLineIntersectsRect({ x: 0, y: 0 }, { x: 5, y: 5 }, rect)).toBe(false);
    });

    it("detects shallow diagonal line through rect", () => {
      // Near-horizontal bullet trajectory crossing the rect
      expect(cs.checkLineIntersectsRect({ x: 0, y: 30 }, { x: 60, y: 35 }, rect)).toBe(true);
    });

    it("returns true for zero-length point inside rect", () => {
      expect(cs.checkLineIntersectsRect({ x: 30, y: 30 }, { x: 30, y: 30 }, rect)).toBe(true);
    });
  });
});
