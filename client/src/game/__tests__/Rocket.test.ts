import { describe, it, expect, vi, beforeEach } from "vitest";
import { Rocket } from "@/game/entities/Rocket";
import { Terrain } from "@/game/world/Terrain";
import { EntityTransform } from "@/game/types/EntityTransform";
import { BoundingBox } from "@/game/types/BoundingBox";
import { Holder } from "@/game/types/interfaces";
import { Vector2 } from "@/game/types/Vector2";
import { STANDARD_ROCKET } from "@/game/weapons/WeaponCatalog";

vi.mock("@/util/SVGAssetLoader", () => ({
  loadSVGAndCreateBounds: vi.fn(() =>
    Promise.resolve({
      bounds: new BoundingBox(40, 40, { x: 0.5, y: 0.5 }),
      svgInfo: undefined,
    })
  ),
}));

const makeTerrain = (height = 100) =>
  ({
    getHeightAt: vi.fn(() => height),
  }) as unknown as Terrain;

const makeHolder = (position: Vector2 = { x: 100, y: 300 }): Holder => ({
  id: "holder_1",
  transform: new EntityTransform(position, 0, 1),
  velocity: { x: 0, y: 0 },
  bounds: new BoundingBox(30, 60, { x: 0.5, y: 0.5 }),
  active: true,
  previousPosition: position,
  getAbsoluteBounds: () => new BoundingBox(30, 60, { x: 0.5, y: 0.5 }).getAbsoluteBounds(position),
  getPrimaryHandAbsTransform: () => new EntityTransform(position, 0, 1),
});

describe("Rocket", () => {
  describe("constructor", () => {
    it("initializes with correct defaults", () => {
      const rocket = new Rocket(100, 300, { x: 400, y: 0 });
      expect(rocket.active).toBe(true);
      expect(rocket.transform.position).toEqual({ x: 100, y: 300 });
      expect(rocket.velocity).toEqual({ x: 400, y: 0 });
      expect(rocket.isExploded()).toBe(false);
      expect(rocket.isLaunched).toBe(false);
    });
  });

  describe("update - propelled flight", () => {
    it("moves by velocity * deltaTime (no gravity)", () => {
      const rocket = new Rocket(100, 300, { x: 400, y: 0 });
      rocket.update(0.1, makeTerrain(0));
      expect(rocket.transform.position.x).toBeCloseTo(140);
      expect(rocket.transform.position.y).toBeCloseTo(300);
    });

    it("tracks previousPosition", () => {
      const rocket = new Rocket(100, 300, { x: 400, y: 0 });
      rocket.update(0.1, makeTerrain(0));
      expect(rocket.previousPosition).toEqual({ x: 100, y: 300 });
    });

    it("does nothing when inactive", () => {
      const rocket = new Rocket(100, 300, { x: 400, y: 0 });
      rocket.active = false;
      rocket.update(0.1, makeTerrain(0));
      expect(rocket.transform.position.x).toBe(100);
    });

    it("animates stabilizer rotation when launched", () => {
      const rocket = new Rocket(100, 300, { x: 400, y: 0 });
      rocket.isLaunched = true;
      rocket.update(0.1, makeTerrain(0));
      expect(rocket.stabilizerRotation).toBeGreaterThan(0);
    });

    it("does not animate stabilizer when not launched", () => {
      const rocket = new Rocket(100, 500, { x: 400, y: 0 });
      rocket.update(0.1, makeTerrain(0));
      expect(rocket.stabilizerRotation).toBe(0);
    });
  });

  describe("update - terrain collision", () => {
    it("explodes on terrain contact", () => {
      // Rocket at y=105, terrain at 100, bounds height 40, bottom = 105 - 20 = 85 < 100
      const rocket = new Rocket(100, 105, { x: 0, y: 0 });
      rocket.update(0.016, makeTerrain(100));
      expect(rocket.isExploded()).toBe(true);
      expect(rocket.active).toBe(false);
    });

    it("does not explode above terrain", () => {
      const rocket = new Rocket(100, 300, { x: 100, y: 0 });
      rocket.update(0.016, makeTerrain(100));
      expect(rocket.isExploded()).toBe(false);
    });
  });

  describe("update - out-of-bounds", () => {
    it("deactivates when x < 0", () => {
      const rocket = new Rocket(-1, 300, { x: -100, y: 0 });
      rocket.update(0.016, makeTerrain(0));
      expect(rocket.active).toBe(false);
    });

    it("deactivates when x >= LEVEL_WIDTH", () => {
      const rocket = new Rocket(Terrain.LEVEL_WIDTH, 300, { x: 100, y: 0 });
      rocket.update(0.016, makeTerrain(0));
      expect(rocket.active).toBe(false);
    });

    it("deactivates when y > WORLD_TOP + 100", () => {
      const rocket = new Rocket(100, Terrain.WORLD_TOP + 101, { x: 0, y: 100 });
      rocket.update(0.016, makeTerrain(0));
      expect(rocket.active).toBe(false);
    });
  });

  describe("update - holder clearing", () => {
    it("clears lastHolder once rocket no longer overlaps", () => {
      const holder = makeHolder({ x: 100, y: 300 });
      const rocket = new Rocket(100, 300, { x: 400, y: 0 }, STANDARD_ROCKET, null);
      // Simulate launch to set lastHolder
      rocket.prepareForLaunch(100, 300, { x: 400, y: 0 }, holder);
      expect(rocket.hasLastHolder()).toBe(true);

      // Move far away so bounding boxes don't overlap
      rocket.update(1.0, makeTerrain(0));
      expect(rocket.hasLastHolder()).toBe(false);
    });
  });

  describe("explode", () => {
    it("marks as exploded and deactivates", () => {
      const rocket = new Rocket(100, 300, { x: 0, y: 0 });
      rocket.explode();
      expect(rocket.isExploded()).toBe(true);
      expect(rocket.active).toBe(false);
    });

    it("is idempotent", () => {
      const rocket = new Rocket(100, 300, { x: 0, y: 0 });
      rocket.explode();
      rocket.explode(); // should not throw
      expect(rocket.isExploded()).toBe(true);
    });
  });

  describe("prepareForLaunch", () => {
    it("sets up rocket for independent flight", () => {
      const holder = makeHolder({ x: 200, y: 400 });
      const rocket = new Rocket(0, 0, { x: 0, y: 0 }, STANDARD_ROCKET, holder);
      expect(rocket.hasHolder()).toBe(true);

      rocket.prepareForLaunch(200, 400, { x: 300, y: 100 }, holder);
      expect(rocket.hasHolder()).toBe(false);
      expect(rocket.hasLastHolder()).toBe(true);
      expect(rocket.isLaunched).toBe(true);
      expect(rocket.velocity).toEqual({ x: 300, y: 100 });
      expect(rocket.active).toBe(true);
    });
  });

  describe("getAbsoluteBounds", () => {
    it("uses own position when no holder", () => {
      const rocket = new Rocket(100, 300, { x: 0, y: 0 });
      const abs = rocket.getAbsoluteBounds();
      expect(abs.upperLeft.x).toBeCloseTo(80);
      expect(abs.lowerRight.x).toBeCloseTo(120);
    });

    it("uses holder position when held", () => {
      const holder = makeHolder({ x: 500, y: 400 });
      const rocket = new Rocket(100, 300, { x: 0, y: 0 }, STANDARD_ROCKET, holder);
      const abs = rocket.getAbsoluteBounds();
      // Should be centered on holder's primary hand position (500, 400)
      expect(abs.upperLeft.x).toBeCloseTo(480);
      expect(abs.lowerRight.x).toBeCloseTo(520);
    });
  });

  describe("getExplosionParameters", () => {
    it("returns parameters at rocket position", () => {
      const rocket = new Rocket(150, 250, { x: 0, y: 0 });
      const params = rocket.getExplosionParameters();
      expect(params.position).toEqual({ x: 150, y: 250 });
      expect(params.radius).toBe(STANDARD_ROCKET.explosionRadius);
    });
  });
});
