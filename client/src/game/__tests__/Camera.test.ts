import { describe, it, expect, beforeEach } from "vitest";
import { Camera } from "@/game/systems/Camera";
import { Terrain } from "@/game/world/Terrain";

describe("Camera", () => {
  const WIDTH = 800;
  const HEIGHT = 600;
  let camera: Camera;

  beforeEach(() => {
    camera = new Camera(WIDTH, HEIGHT);
  });

  describe("initial state", () => {
    it("starts at origin", () => {
      expect(camera.bottomLeftWorldX).toBe(0);
      expect(camera.bottomLeftWorldY).toBe(0);
    });
  });

  describe("followTarget - first frame snap", () => {
    it("snaps to target position immediately on first call", () => {
      camera.followTarget({ x: 500, y: 300 }, 0.016);
      // desiredX = 500 - 800/2 + 100 (lookAhead) = 200
      expect(camera.bottomLeftWorldX).toBe(200);
    });

    it("clamps left boundary to 0", () => {
      camera.followTarget({ x: 0, y: 300 }, 0.016);
      // desiredX = 0 - 400 + 100 = -300, clamped to 0
      expect(camera.bottomLeftWorldX).toBe(0);
    });

    it("clamps right boundary to LEVEL_WIDTH - width", () => {
      camera.followTarget({ x: Terrain.LEVEL_WIDTH, y: 300 }, 0.016);
      expect(camera.bottomLeftWorldX).toBe(Terrain.LEVEL_WIDTH - WIDTH);
    });

    it("clamps bottom boundary to WORLD_BOTTOM", () => {
      camera.followTarget({ x: 500, y: Terrain.WORLD_BOTTOM - 1000 }, 0.016);
      expect(camera.bottomLeftWorldY).toBe(Terrain.WORLD_BOTTOM);
    });
  });

  describe("followTarget - smooth interpolation", () => {
    it("moves smoothly toward target on second call", () => {
      camera.followTarget({ x: 500, y: 300 }, 0.016);
      const firstX = camera.bottomLeftWorldX;

      // Move target far to the right
      camera.followTarget({ x: 2000, y: 300 }, 0.016);
      // Should have moved toward new desired position but not reached it
      expect(camera.bottomLeftWorldX).toBeGreaterThan(firstX);
      // desiredX for 2000 = 2000 - 400 + 100 = 1700, shouldn't reach that
      expect(camera.bottomLeftWorldX).toBeLessThan(1700);
    });

    it("converges over many frames", () => {
      camera.followTarget({ x: 4000, y: 300 }, 0.016);
      // Run many frames at same target
      for (let i = 0; i < 300; i++) {
        camera.followTarget({ x: 4000, y: 300 }, 0.016);
      }
      // desiredX = 4000 - 400 + 100 = 3700
      expect(camera.bottomLeftWorldX).toBeCloseTo(3700, 0);
    });
  });

  describe("followTarget - terrain awareness", () => {
    it("adjusts camera when terrain is high", () => {
      const terrain = {
        getHeightAt: () => 500,
      } as unknown as Terrain;
      camera.setTerrain(terrain);

      // When world height < canvas height, it pins to WORLD_BOTTOM
      // WORLD_TOP - WORLD_BOTTOM = 600, HEIGHT = 600 => fits, so desiredY = WORLD_BOTTOM = 0
      camera.followTarget({ x: 500, y: 300 }, 0.016);
      expect(camera.bottomLeftWorldY).toBe(Terrain.WORLD_BOTTOM);
    });

    it("uses fallback height 300 when terrain is not set", () => {
      // No terrain set, should use fallback. World fits (600 height), so desiredY = WORLD_BOTTOM
      camera.followTarget({ x: 500, y: 300 }, 0.016);
      expect(camera.bottomLeftWorldY).toBe(Terrain.WORLD_BOTTOM);
    });
  });

  describe("reset", () => {
    it("resets position and snaps on next followTarget", () => {
      camera.followTarget({ x: 4000, y: 300 }, 0.016);
      const afterFirst = camera.bottomLeftWorldX;
      expect(afterFirst).toBeGreaterThan(0);

      camera.reset();
      expect(camera.bottomLeftWorldX).toBe(0);
      expect(camera.bottomLeftWorldY).toBe(0);

      // After reset, first followTarget should snap again
      camera.followTarget({ x: 1000, y: 300 }, 0.016);
      // desiredX = 1000 - 400 + 100 = 700
      expect(camera.bottomLeftWorldX).toBe(700);
    });
  });

  describe("toScreenY", () => {
    it("converts world Y to screen Y", () => {
      // toScreenY = height - WORLD_TOP - worldY = 600 - 600 - worldY = -worldY
      expect(camera.toScreenY(0)).toBe(0);
      expect(camera.toScreenY(100)).toBe(-100);
      expect(camera.toScreenY(-100)).toBe(100);
    });
  });

  describe("updateSize", () => {
    it("updates width and height", () => {
      camera.updateSize(1024, 768);
      expect(camera.width).toBe(1024);
      expect(camera.height).toBe(768);
    });

    it("re-snaps on the next follow after the viewport changes", () => {
      // Settle at a followed position far into the level (isInitialized = true).
      for (let i = 0; i < 300; i++) camera.followTarget({ x: 4000, y: 300 }, 0.016);

      camera.updateSize(400, 800);
      camera.followTarget({ x: 1000, y: 300 }, 0.016);

      // Snapped straight to the new desired X (1000 - 400/2 + 100), not smoothed
      // partway from ~3700.
      expect(camera.bottomLeftWorldX).toBe(900);
    });

    it("does not re-snap when the size is unchanged", () => {
      camera.followTarget({ x: 4000, y: 300 }, 0.016);
      const before = camera.bottomLeftWorldX;

      camera.updateSize(WIDTH, HEIGHT); // same dimensions
      camera.followTarget({ x: 8000, y: 300 }, 0.016);

      // Still initialized, so it smooths (moves only partway) instead of snapping.
      expect(camera.bottomLeftWorldX).toBeGreaterThan(before);
      expect(camera.bottomLeftWorldX).toBeLessThan(8000 - WIDTH / 2 + 100);
    });

    it("bottom-aligns the world after switching to a viewport taller than the world", () => {
      // Landscape: shorter than the 600-tall world → centered on the player.
      camera.updateSize(800, 375);
      camera.followTarget({ x: 500, y: 300 }, 0.016);

      // Portrait: taller than the world → the world pins to the bottom of the view.
      camera.updateSize(390, 800);
      camera.followTarget({ x: 500, y: 300 }, 0.016);

      expect(camera.bottomLeftWorldY).toBe(Terrain.WORLD_BOTTOM);
      // The world's bottom (worldY 0) lands exactly at the canvas bottom — no gap.
      const worldBottomScreenY = camera.height - 0 + camera.bottomLeftWorldY;
      expect(worldBottomScreenY).toBe(camera.height);
    });
  });
});
