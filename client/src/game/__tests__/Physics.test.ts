import { describe, it, expect } from "vitest";
import { Physics } from "../Physics";
import { EntityTransform } from "../EntityTransform";

function makeGameObject(x: number, y: number, vx: number, vy: number) {
  return {
    transform: new EntityTransform({ x, y }),
    velocity: { x: vx, y: vy },
  };
}

describe("Physics", () => {
  describe("GRAVITY", () => {
    it("is defined as 1500", () => {
      expect(Physics.GRAVITY).toBe(1500);
    });
  });

  describe("applyGravity", () => {
    it("decreases y velocity by gravity * deltaTime", () => {
      const obj = makeGameObject(0, 100, 0, 0);
      Physics.applyGravity(obj as any, 1 / 60);
      expect(obj.velocity.y).toBeCloseTo(-25); // -1500/60
    });

    it("updates position based on velocity", () => {
      const obj = makeGameObject(100, 200, 60, 120);
      Physics.applyGravity(obj as any, 0.5);
      // x: 100 + 60*0.5 = 130
      expect(obj.transform.position.x).toBeCloseTo(130);
      // vy after gravity: 120 - 1500*0.5 = -630
      // y: 200 + (-630)*0.5 = 200 - 315 = -115
      expect(obj.velocity.y).toBeCloseTo(-630);
      expect(obj.transform.position.y).toBeCloseTo(-115);
    });

    it("accumulates gravity over multiple frames", () => {
      const obj = makeGameObject(0, 500, 0, 0);
      const dt = 1 / 60;
      for (let i = 0; i < 60; i++) {
        Physics.applyGravity(obj as any, dt);
      }
      // After 1 second of gravity, velocity should be approximately -1500
      expect(obj.velocity.y).toBeCloseTo(-1500, 0);
      // Position drops significantly
      expect(obj.transform.position.y).toBeLessThan(500);
    });
  });
});
