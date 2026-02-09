import { describe, it, expect, beforeEach } from "vitest";
import { Bullet } from "../Bullet";
import { Terrain } from "../Terrain";

describe("Bullet", () => {
  const makeBullet = (
    x = 100,
    y = 300,
    direction = { x: 1, y: 0 },
    speed = 600,
    damage = 20,
    bulletSize = 3
  ) => new Bullet(x, y, direction, speed, damage, bulletSize);

  describe("constructor", () => {
    it("initializes with correct position and velocity", () => {
      const bullet = makeBullet(100, 300, { x: 1, y: 0 }, 600);
      expect(bullet.transform.position).toEqual({ x: 100, y: 300 });
      expect(bullet.velocity).toEqual({ x: 600, y: 0 });
      expect(bullet.active).toBe(true);
      expect(bullet.damage).toBe(20);
    });

    it("computes diagonal velocity from direction and speed", () => {
      const diag = Math.SQRT1_2;
      const bullet = makeBullet(0, 0, { x: diag, y: diag }, 100);
      expect(bullet.velocity.x).toBeCloseTo(diag * 100);
      expect(bullet.velocity.y).toBeCloseTo(diag * 100);
    });
  });

  describe("update - movement", () => {
    it("moves bullet by velocity * deltaTime", () => {
      const bullet = makeBullet(100, 300, { x: 1, y: 0 }, 600);
      bullet.update(0.1);
      expect(bullet.transform.position.x).toBeCloseTo(160);
      expect(bullet.transform.position.y).toBeCloseTo(300);
    });

    it("tracks previousPosition", () => {
      const bullet = makeBullet(100, 300, { x: 1, y: 0 }, 600);
      bullet.update(0.1);
      expect(bullet.previousPosition).toEqual({ x: 100, y: 300 });
      bullet.update(0.1);
      expect(bullet.previousPosition.x).toBeCloseTo(160);
    });

    it("does nothing when inactive", () => {
      const bullet = makeBullet();
      bullet.active = false;
      bullet.update(0.1);
      expect(bullet.transform.position.x).toBe(100);
    });
  });

  describe("update - max distance deactivation", () => {
    it("deactivates after traveling maxTravelDistance (1500)", () => {
      const bullet = makeBullet(0, 300, { x: 1, y: 0 }, 1000);
      // 1.6 seconds * 1000 speed = 1600 > 1500
      bullet.update(1.6);
      expect(bullet.active).toBe(false);
    });

    it("stays active within maxTravelDistance", () => {
      const bullet = makeBullet(0, 300, { x: 1, y: 0 }, 1000);
      bullet.update(1.4); // 1400 < 1500
      expect(bullet.active).toBe(true);
    });
  });

  describe("update - out-of-bounds deactivation", () => {
    it("deactivates when x < -100", () => {
      const bullet = makeBullet(-50, 300, { x: -1, y: 0 }, 600);
      bullet.update(0.1); // x = -50 + (-600 * 0.1) = -110 < -100
      expect(bullet.active).toBe(false);
    });

    it("deactivates when x > LEVEL_WIDTH + 100", () => {
      const bullet = makeBullet(Terrain.LEVEL_WIDTH + 50, 300, { x: 1, y: 0 }, 600);
      bullet.update(0.1);
      expect(bullet.active).toBe(false);
    });

    it("deactivates when y < WORLD_BOTTOM", () => {
      const bullet = makeBullet(100, 10, { x: 0, y: -1 }, 600);
      bullet.update(0.1); // y = 10 - 60 = -50 < 0
      expect(bullet.active).toBe(false);
    });

    it("deactivates when y > WORLD_TOP + 100", () => {
      const bullet = makeBullet(100, Terrain.WORLD_TOP + 90, { x: 0, y: 1 }, 600);
      bullet.update(0.1); // y = 690 + 60 = 750 > 700
      expect(bullet.active).toBe(false);
    });
  });

  describe("getAbsoluteBounds", () => {
    it("returns bounds centered on position", () => {
      const bullet = makeBullet(100, 300, { x: 1, y: 0 }, 600, 20, 4);
      const abs = bullet.getAbsoluteBounds();
      // BoundingBox(4, 4, {0.5, 0.5}) centered at (100, 300)
      expect(abs.upperLeft.x).toBeCloseTo(98);
      expect(abs.lowerRight.x).toBeCloseTo(102);
    });
  });

  describe("deactivate", () => {
    it("sets active to false", () => {
      const bullet = makeBullet();
      bullet.deactivate("test");
      expect(bullet.active).toBe(false);
    });
  });
});
