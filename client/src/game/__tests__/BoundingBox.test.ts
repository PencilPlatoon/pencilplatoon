import { describe, it, expect } from "vitest";
import { BoundingBox } from "../BoundingBox";

describe("BoundingBox", () => {
  describe("create", () => {
    it("creates a bounding box with given dimensions and ref position", () => {
      const bb = BoundingBox.create(100, 50, { x: 0.5, y: 0.5 });
      expect(bb.width).toBe(100);
      expect(bb.height).toBe(50);
      expect(bb.refRatioPosition).toEqual({ x: 0.5, y: 0.5 });
    });
  });

  describe("getAbsoluteCenter", () => {
    it("returns center when ref is at center", () => {
      const bb = new BoundingBox(100, 50, { x: 0.5, y: 0.5 });
      expect(bb.getAbsoluteCenter({ x: 200, y: 300 })).toEqual({ x: 200, y: 300 });
    });

    it("returns offset center when ref is at top-left corner", () => {
      const bb = new BoundingBox(100, 50, { x: 0, y: 0 });
      // Center is at refPoint + half dimensions
      expect(bb.getAbsoluteCenter({ x: 0, y: 0 })).toEqual({ x: 50, y: 25 });
    });

    it("returns offset center when ref is at bottom-right corner", () => {
      const bb = new BoundingBox(100, 50, { x: 1, y: 1 });
      expect(bb.getAbsoluteCenter({ x: 100, y: 50 })).toEqual({ x: 50, y: 25 });
    });
  });

  describe("getAbsoluteBounds", () => {
    it("returns correct bounds with centered ref", () => {
      const bb = new BoundingBox(100, 50, { x: 0.5, y: 0.5 });
      const bounds = bb.getAbsoluteBounds({ x: 200, y: 300 });
      // Y-up: upperLeft.y is top (higher), lowerRight.y is bottom (lower)
      expect(bounds.upperLeft.x).toBe(150);
      expect(bounds.lowerRight.x).toBe(250);
      expect(bounds.upperLeft.y).toBe(325);
      expect(bounds.lowerRight.y).toBe(275);
    });

    it("returns correct bounds with corner ref", () => {
      const bb = new BoundingBox(100, 50, { x: 0, y: 0 });
      const bounds = bb.getAbsoluteBounds({ x: 0, y: 0 });
      expect(bounds.upperLeft).toEqual({ x: 0, y: 50 });
      expect(bounds.lowerRight).toEqual({ x: 100, y: 0 });
    });
  });

  describe("getBoundingPositions", () => {
    it("returns four corners in clockwise order", () => {
      const bb = new BoundingBox(100, 50, { x: 0.5, y: 0.5 });
      const { positions } = bb.getBoundingPositions({ x: 200, y: 300 });
      expect(positions).toHaveLength(4);
      // top-left, top-right, bottom-right, bottom-left
      expect(positions[0]).toEqual({ x: 150, y: 325 }); // top-left
      expect(positions[1]).toEqual({ x: 250, y: 325 }); // top-right
      expect(positions[2]).toEqual({ x: 250, y: 275 }); // bottom-right
      expect(positions[3]).toEqual({ x: 150, y: 275 }); // bottom-left
    });
  });

  describe("getRelPositionDelta", () => {
    it("computes pixel delta between two ratio positions", () => {
      const bb = new BoundingBox(200, 100, { x: 0.5, y: 0.5 });
      const delta = bb.getRelPositionDelta({ x: 0.8, y: 0.3 }, { x: 0.2, y: 0.7 });
      expect(delta.x).toBeCloseTo(120); // 200 * 0.6
      expect(delta.y).toBeCloseTo(-40); // 100 * -0.4
    });

    it("returns zero for identical positions", () => {
      const bb = new BoundingBox(200, 100, { x: 0.5, y: 0.5 });
      expect(bb.getRelPositionDelta({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })).toEqual({ x: 0, y: 0 });
    });
  });

  describe("convertRelToRatioPosition", () => {
    it("converts pixel offset to ratio coordinates", () => {
      const bb = new BoundingBox(200, 100, { x: 0.5, y: 0.5 });
      const ratio = bb.convertRelToRatioPosition({ x: 50, y: 25 });
      expect(ratio.x).toBeCloseTo(0.75); // 0.5 + 50/200
      expect(ratio.y).toBeCloseTo(0.75); // 0.5 + 25/100
    });

    it("clamps to 0-1 by default", () => {
      const bb = new BoundingBox(100, 100, { x: 0.5, y: 0.5 });
      const ratio = bb.convertRelToRatioPosition({ x: 200, y: -200 });
      expect(ratio.x).toBe(1);
      expect(ratio.y).toBe(0);
    });

    it("does not clamp when clamp=false", () => {
      const bb = new BoundingBox(100, 100, { x: 0.5, y: 0.5 });
      const ratio = bb.convertRelToRatioPosition({ x: 200, y: -200 }, false);
      expect(ratio.x).toBeCloseTo(2.5);
      expect(ratio.y).toBeCloseTo(-1.5);
    });
  });

  describe("getTransformForRatioPositions", () => {
    it("returns an EntityTransform with rotated delta", () => {
      const bb = new BoundingBox(200, 100, { x: 0.5, y: 0.5 });
      const transform = bb.getTransformForRatioPositions(
        { x: 0.75, y: 0.5 },
        { x: 0.25, y: 0.5 },
        0
      );
      // Delta is (100, 0), rotation 0 → position (100, 0)
      expect(transform.position.x).toBeCloseTo(100);
      expect(transform.position.y).toBeCloseTo(0);
      expect(transform.rotation).toBe(0);
      expect(transform.facing).toBe(1);
    });
  });
});
