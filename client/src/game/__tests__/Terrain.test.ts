import { describe, it, expect } from "vitest";
import { Terrain, toCanvasY } from "../Terrain";

const FLAT_CONFIG = { amplitude: 0, frequency: 0.001, roughness: 0 };
const HILLY_CONFIG = { amplitude: 40, frequency: 0.001, roughness: 1 };

describe("Terrain", () => {
  describe("constants", () => {
    it("has expected world bounds", () => {
      expect(Terrain.WORLD_TOP).toBe(600);
      expect(Terrain.WORLD_BOTTOM).toBe(0);
      expect(Terrain.LEVEL_WIDTH).toBe(8000);
    });
  });

  describe("generateTerrain", () => {
    it("generates terrain without throwing", () => {
      const terrain = new Terrain();
      expect(() => terrain.generateTerrain(FLAT_CONFIG)).not.toThrow();
    });
  });

  describe("getLevelWidth", () => {
    it("returns LEVEL_WIDTH", () => {
      const terrain = new Terrain();
      expect(terrain.getLevelWidth()).toBe(8000);
    });
  });

  describe("getHeightAt", () => {
    it("returns a height within world bounds", () => {
      const terrain = new Terrain();
      terrain.generateTerrain(HILLY_CONFIG);
      const height = terrain.getHeightAt(1000);
      expect(height).toBeGreaterThanOrEqual(Terrain.WORLD_BOTTOM + 20);
      expect(height).toBeLessThanOrEqual(Terrain.WORLD_TOP - 100);
    });

    it("interpolates between terrain points", () => {
      const terrain = new Terrain();
      terrain.generateTerrain(HILLY_CONFIG);
      // Points are every 100px; get heights at boundaries and midpoint
      const h0 = terrain.getHeightAt(1000);
      const h1 = terrain.getHeightAt(1100);
      const hMid = terrain.getHeightAt(1050);
      // Midpoint should be between the two (linear interpolation)
      const expected = (h0 + h1) / 2;
      expect(hMid).toBeCloseTo(expected, 5);
    });

    it("throws for x outside terrain range", () => {
      const terrain = new Terrain();
      terrain.generateTerrain(FLAT_CONFIG);
      expect(() => terrain.getHeightAt(-100)).toThrow();
      expect(() => terrain.getHeightAt(9000)).toThrow();
    });

    it("throws if terrain not generated", () => {
      const terrain = new Terrain();
      expect(() => terrain.getHeightAt(100)).toThrow("Terrain not generated");
    });
  });

  describe("calculateSlopeAt", () => {
    it("returns a finite slope value", () => {
      const terrain = new Terrain();
      terrain.generateTerrain(HILLY_CONFIG);
      const slope = terrain.calculateSlopeAt(2000);
      expect(Number.isFinite(slope)).toBe(true);
    });

    it("returns 0 at edges where getHeightAt fails", () => {
      const terrain = new Terrain();
      terrain.generateTerrain(FLAT_CONFIG);
      // At x=0, sampling x-20 would be negative → error → returns 0
      expect(terrain.calculateSlopeAt(0)).toBe(0);
    });

    it("returns near-zero for flat terrain", () => {
      const terrain = new Terrain();
      terrain.generateTerrain(FLAT_CONFIG);
      const slope = terrain.calculateSlopeAt(4000);
      expect(Math.abs(slope)).toBeLessThan(0.01);
    });
  });

  describe("checkCollision", () => {
    it("detects collision with terrain", () => {
      const terrain = new Terrain();
      terrain.generateTerrain(FLAT_CONFIG);
      // An object at the very bottom of the world should collide with terrain
      const result = terrain.checkCollision({
        upperLeft: { x: 100, y: 50 },
        lowerRight: { x: 150, y: 0 },
      });
      expect(result).toBe(true);
    });

    it("does not collide above terrain", () => {
      const terrain = new Terrain();
      terrain.generateTerrain(FLAT_CONFIG);
      // An object well above the terrain surface should not collide
      const result = terrain.checkCollision({
        upperLeft: { x: 100, y: 590 },
        lowerRight: { x: 150, y: 550 },
      });
      expect(result).toBe(false);
    });
  });
});

describe("toCanvasY", () => {
  it("converts world Y to canvas Y", () => {
    expect(toCanvasY(0)).toBe(600); // bottom of world → bottom of canvas
    expect(toCanvasY(600)).toBe(0); // top of world → top of canvas
    expect(toCanvasY(300)).toBe(300); // middle
  });
});
