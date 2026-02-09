import { describe, it, expect } from "vitest";
import { EntityTransform } from "../types/EntityTransform";

describe("EntityTransform", () => {
  describe("constructor and fromPosition", () => {
    it("creates with defaults", () => {
      const t = new EntityTransform({ x: 10, y: 20 });
      expect(t.position).toEqual({ x: 10, y: 20 });
      expect(t.rotation).toBe(0);
      expect(t.facing).toBe(1);
    });

    it("fromPosition is equivalent to constructor", () => {
      const t = EntityTransform.fromPosition({ x: 5, y: 6 }, 0.3, -1);
      expect(t.position).toEqual({ x: 5, y: 6 });
      expect(t.rotation).toBe(0.3);
      expect(t.facing).toBe(-1);
    });
  });

  describe("clone", () => {
    it("creates a copy with same values", () => {
      const original = new EntityTransform({ x: 1, y: 2 }, 0.5, -1);
      const cloned = original.clone();
      expect(cloned.position).toEqual({ x: 1, y: 2 });
      expect(cloned.rotation).toBe(0.5);
      expect(cloned.facing).toBe(-1);
    });
  });

  describe("setters", () => {
    it("setPosition updates position", () => {
      const t = new EntityTransform({ x: 0, y: 0 });
      t.setPosition(5, 10);
      expect(t.position).toEqual({ x: 5, y: 10 });
    });

    it("setRotation updates rotation", () => {
      const t = new EntityTransform({ x: 0, y: 0 });
      t.setRotation(1.5);
      expect(t.rotation).toBe(1.5);
    });

    it("setFacing updates facing", () => {
      const t = new EntityTransform({ x: 0, y: 0 });
      t.setFacing(-1);
      expect(t.facing).toBe(-1);
    });
  });

  describe("getWeaponPosition", () => {
    it("offsets by arm length in facing direction", () => {
      const t = new EntityTransform({ x: 100, y: 200 }, 0, 1);
      expect(t.getWeaponPosition(30)).toEqual({ x: 130, y: 200 });
    });

    it("offsets left when facing left", () => {
      const t = new EntityTransform({ x: 100, y: 200 }, 0, -1);
      expect(t.getWeaponPosition(30)).toEqual({ x: 70, y: 200 });
    });
  });

  describe("applyTransform", () => {
    it("applies relative transform facing right", () => {
      const base = new EntityTransform({ x: 100, y: 200 }, 0.1, 1);
      const relative = new EntityTransform({ x: 10, y: 5 }, 0.2, 1);
      const result = base.applyTransform(relative);
      expect(result.position).toEqual({ x: 110, y: 205 });
      expect(result.rotation).toBeCloseTo(0.3);
      expect(result.facing).toBe(1);
    });

    it("flips relative x when facing left", () => {
      const base = new EntityTransform({ x: 100, y: 200 }, 0, -1);
      const relative = new EntityTransform({ x: 10, y: 5 }, 0, 1);
      const result = base.applyTransform(relative);
      expect(result.position).toEqual({ x: 90, y: 205 });
      expect(result.facing).toBe(-1);
    });

    it("combines facing directions", () => {
      const base = new EntityTransform({ x: 0, y: 0 }, 0, -1);
      const relative = new EntityTransform({ x: 0, y: 0 }, 0, -1);
      const result = base.applyTransform(relative);
      expect(result.facing).toBe(1); // -1 * -1 = 1
    });
  });

  describe("reverseTransform", () => {
    it("is the inverse of applyTransform", () => {
      const base = new EntityTransform({ x: 100, y: 200 }, 0.1, 1);
      const relative = new EntityTransform({ x: 10, y: 5 }, 0.2, 1);
      const absolute = base.applyTransform(relative);
      const recovered = base.reverseTransform(absolute);
      expect(recovered.position.x).toBeCloseTo(relative.position.x);
      expect(recovered.position.y).toBeCloseTo(relative.position.y);
      expect(recovered.rotation).toBeCloseTo(relative.rotation);
      expect(recovered.facing).toBe(relative.facing);
    });

    it("is the inverse of applyTransform when facing left", () => {
      const base = new EntityTransform({ x: 100, y: 200 }, 0.5, -1);
      const relative = new EntityTransform({ x: 20, y: -10 }, 0.3, -1);
      const absolute = base.applyTransform(relative);
      const recovered = base.reverseTransform(absolute);
      expect(recovered.position.x).toBeCloseTo(relative.position.x);
      expect(recovered.position.y).toBeCloseTo(relative.position.y);
      expect(recovered.rotation).toBeCloseTo(relative.rotation);
      expect(recovered.facing).toBe(relative.facing);
    });
  });
});
