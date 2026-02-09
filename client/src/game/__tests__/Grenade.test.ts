import { describe, it, expect, vi, beforeEach } from "vitest";
import { Grenade } from "../Grenade";
import { Terrain } from "../Terrain";
import { BoundingBox } from "../BoundingBox";

vi.mock("@/util/SVGAssetLoader", () => ({
  loadSVGAndCreateBounds: vi.fn(() =>
    Promise.resolve({
      bounds: new BoundingBox(10, 10, { x: 0.5, y: 0.5 }),
      svgInfo: undefined,
    })
  ),
}));

const makeTerrain = (height = 100, slope = 0) =>
  ({
    getHeightAt: vi.fn(() => height),
    calculateSlopeAt: vi.fn(() => slope),
  }) as unknown as Terrain;

describe("Grenade", () => {
  describe("constructor", () => {
    it("initializes with correct defaults", () => {
      const grenade = new Grenade(100, 300, { x: 50, y: 100 });
      expect(grenade.active).toBe(true);
      expect(grenade.transform.position).toEqual({ x: 100, y: 300 });
      expect(grenade.velocity).toEqual({ x: 50, y: 100 });
      expect(grenade.isExploded()).toBe(false);
    });
  });

  describe("update - gravity", () => {
    it("applies gravity (velocity.y decreases)", () => {
      const grenade = new Grenade(100, 500, { x: 50, y: 100 });
      const terrain = makeTerrain(0); // terrain far below
      grenade.update(0.1, terrain);
      // gravity = 1500, velocity.y after = 100 - 1500*0.1 = -50
      expect(grenade.velocity.y).toBeLessThan(100);
    });
  });

  describe("update - explosion timer", () => {
    it("explodes after explosionDelay seconds", () => {
      // Place grenade on terrain (y=105, terrain=100) so it doesn't fall out of bounds
      const grenade = new Grenade(100, 105, { x: 0, y: 0 });
      const terrain = makeTerrain(100, 0);
      // HAND_GRENADE explosionDelay = 3
      // Tick in small increments so grenade stays on terrain
      for (let i = 0; i < 29; i++) {
        grenade.update(0.1, terrain);
      }
      // At 2.9s, should still be active
      expect(grenade.active).toBe(true);
      expect(grenade.isExploded()).toBe(false);

      // Tick past 3 seconds total
      grenade.update(0.2, terrain);
      expect(grenade.active).toBe(false);
      expect(grenade.isExploded()).toBe(true);
    });
  });

  describe("update - terrain collision", () => {
    it("stops vertical velocity on terrain hit", () => {
      // Grenade at y=105, terrain at 100, bounds height 10 → bottom = 100 → hits
      const grenade = new Grenade(100, 105, { x: 100, y: -50 });
      const terrain = makeTerrain(100, 0);
      grenade.update(0.016, terrain);
      expect(grenade.velocity.y).toBe(0);
    });

    it("snaps position to terrain surface", () => {
      const grenade = new Grenade(100, 103, { x: 100, y: -200 });
      const terrain = makeTerrain(100, 0);
      grenade.update(0.016, terrain);
      // grenadeBottom = pos.y - 5, should be >= 100, so pos.y = 105
      expect(grenade.transform.position.y).toBe(105);
    });
  });

  describe("update - rolling physics", () => {
    it("enters rolling state on terrain contact with sufficient velocity", () => {
      const grenade = new Grenade(100, 104, { x: 200, y: -10 });
      const terrain = makeTerrain(100, 0);
      grenade.update(0.016, terrain);
      // velocity.x > MIN_VELOCITY_TO_ROLL (50), should start rolling with BOUNCE_DAMPING
      expect(grenade.velocity.x).toBeCloseTo(200 * 0.6);
    });

    it("applies friction while rolling", () => {
      const grenade = new Grenade(100, 104, { x: 200, y: -10 });
      const terrain = makeTerrain(100, 0);
      // First update enters rolling
      grenade.update(0.016, terrain);
      const afterFirstRoll = grenade.velocity.x;
      // Second update applies rolling friction
      grenade.update(0.016, terrain);
      expect(Math.abs(grenade.velocity.x)).toBeLessThan(Math.abs(afterFirstRoll));
    });
  });

  describe("update - out-of-bounds", () => {
    it("deactivates when x < 0", () => {
      const grenade = new Grenade(-1, 300, { x: 0, y: 0 });
      grenade.update(0.016, makeTerrain());
      expect(grenade.active).toBe(false);
    });

    it("deactivates when x >= LEVEL_WIDTH", () => {
      const grenade = new Grenade(Terrain.LEVEL_WIDTH, 300, { x: 0, y: 0 });
      grenade.update(0.016, makeTerrain());
      expect(grenade.active).toBe(false);
    });

    it("deactivates when y < WORLD_BOTTOM", () => {
      const grenade = new Grenade(100, Terrain.WORLD_BOTTOM - 1, { x: 0, y: 0 });
      grenade.update(0.016, makeTerrain());
      expect(grenade.active).toBe(false);
    });
  });

  describe("prepareForThrow", () => {
    it("resets grenade state for a new throw", () => {
      const grenade = new Grenade(100, 300, { x: 0, y: 0 });
      // Simulate some lifetime
      grenade.update(1.0, makeTerrain(0));

      grenade.prepareForThrow(500, 400, { x: 100, y: 200 });
      expect(grenade.transform.position).toEqual({ x: 500, y: 400 });
      expect(grenade.velocity).toEqual({ x: 100, y: 200 });
      expect(grenade.active).toBe(true);
      expect(grenade.isExploded()).toBe(false);
    });
  });

  describe("getExplosionParameters", () => {
    it("returns parameters with correct radius and position", () => {
      const grenade = new Grenade(150, 250, { x: 0, y: 0 });
      const params = grenade.getExplosionParameters();
      expect(params.position).toEqual({ x: 150, y: 250 });
      expect(params.radius).toBe(Grenade.HAND_GRENADE.explosionRadius);
      expect(params.particleCount).toBe(20);
    });
  });

  describe("getAbsoluteBounds", () => {
    it("returns bounds at current position", () => {
      const grenade = new Grenade(100, 300, { x: 0, y: 0 });
      const abs = grenade.getAbsoluteBounds();
      // BoundingBox(10, 10, {0.5, 0.5}) at (100, 300)
      expect(abs.upperLeft.x).toBeCloseTo(95);
      expect(abs.lowerRight.x).toBeCloseTo(105);
    });
  });

  describe("does not update when inactive", () => {
    it("skips update when active is false", () => {
      const grenade = new Grenade(100, 300, { x: 100, y: 0 });
      grenade.active = false;
      grenade.update(1.0, makeTerrain());
      expect(grenade.transform.position.x).toBe(100);
    });
  });
});
