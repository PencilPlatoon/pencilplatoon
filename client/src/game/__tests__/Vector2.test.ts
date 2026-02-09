import { describe, it, expect } from "vitest";
import { Vector2Utils } from "../types/Vector2";

describe("Vector2Utils", () => {
  describe("subtract", () => {
    it("subtracts two vectors", () => {
      expect(Vector2Utils.subtract({ x: 5, y: 3 }, { x: 2, y: 1 })).toEqual({ x: 3, y: 2 });
    });

    it("handles negative results", () => {
      expect(Vector2Utils.subtract({ x: 1, y: 1 }, { x: 3, y: 5 })).toEqual({ x: -2, y: -4 });
    });
  });

  describe("add", () => {
    it("adds two vectors", () => {
      expect(Vector2Utils.add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
    });

    it("handles negatives", () => {
      expect(Vector2Utils.add({ x: -1, y: 2 }, { x: 3, y: -4 })).toEqual({ x: 2, y: -2 });
    });
  });

  describe("multiply", () => {
    it("scales a vector by a scalar", () => {
      expect(Vector2Utils.multiply({ x: 2, y: 3 }, 4)).toEqual({ x: 8, y: 12 });
    });

    it("handles zero scalar", () => {
      expect(Vector2Utils.multiply({ x: 5, y: 10 }, 0)).toEqual({ x: 0, y: 0 });
    });

    it("handles negative scalar", () => {
      expect(Vector2Utils.multiply({ x: 2, y: -3 }, -2)).toEqual({ x: -4, y: 6 });
    });
  });

  describe("divide", () => {
    it("divides a vector by a scalar", () => {
      expect(Vector2Utils.divide({ x: 10, y: 6 }, 2)).toEqual({ x: 5, y: 3 });
    });
  });

  describe("magnitude", () => {
    it("returns length of a vector", () => {
      expect(Vector2Utils.magnitude({ x: 3, y: 4 })).toBe(5);
    });

    it("returns 0 for zero vector", () => {
      expect(Vector2Utils.magnitude({ x: 0, y: 0 })).toBe(0);
    });

    it("handles unit axes", () => {
      expect(Vector2Utils.magnitude({ x: 1, y: 0 })).toBe(1);
      expect(Vector2Utils.magnitude({ x: 0, y: 1 })).toBe(1);
    });
  });

  describe("normalize", () => {
    it("returns unit vector in same direction", () => {
      const result = Vector2Utils.normalize({ x: 3, y: 4 });
      expect(result.x).toBeCloseTo(0.6);
      expect(result.y).toBeCloseTo(0.8);
    });

    it("returns zero vector unchanged", () => {
      expect(Vector2Utils.normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    });

    it("normalized vector has magnitude 1", () => {
      const result = Vector2Utils.normalize({ x: 7, y: -3 });
      expect(Vector2Utils.magnitude(result)).toBeCloseTo(1);
    });
  });

  describe("clampToRatioBounds", () => {
    it("clamps values to 0-1 range", () => {
      expect(Vector2Utils.clampToRatioBounds({ x: -0.5, y: 1.5 })).toEqual({ x: 0, y: 1 });
    });

    it("leaves values already in range unchanged", () => {
      expect(Vector2Utils.clampToRatioBounds({ x: 0.3, y: 0.7 })).toEqual({ x: 0.3, y: 0.7 });
    });

    it("handles boundary values", () => {
      expect(Vector2Utils.clampToRatioBounds({ x: 0, y: 1 })).toEqual({ x: 0, y: 1 });
    });
  });

  describe("rotate", () => {
    it("rotates by 90 degrees", () => {
      const result = Vector2Utils.rotate({ x: 1, y: 0 }, Math.PI / 2);
      expect(result.x).toBeCloseTo(0);
      expect(result.y).toBeCloseTo(1);
    });

    it("rotates by 180 degrees", () => {
      const result = Vector2Utils.rotate({ x: 1, y: 0 }, Math.PI);
      expect(result.x).toBeCloseTo(-1);
      expect(result.y).toBeCloseTo(0);
    });

    it("rotating by 0 returns the same vector", () => {
      const result = Vector2Utils.rotate({ x: 3, y: 4 }, 0);
      expect(result.x).toBeCloseTo(3);
      expect(result.y).toBeCloseTo(4);
    });

    it("rotating by full circle returns the same vector", () => {
      const result = Vector2Utils.rotate({ x: 3, y: 4 }, Math.PI * 2);
      expect(result.x).toBeCloseTo(3);
      expect(result.y).toBeCloseTo(4);
    });
  });
});
