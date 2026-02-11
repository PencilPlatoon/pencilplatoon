import { describe, it, expect, vi, beforeEach } from "vitest";
import { ShootingWeapon } from "@/game/weapons/ShootingWeapon";
import { ShootingWeaponType } from "@/game/types/interfaces";
import { EntityTransform } from "@/game/types/EntityTransform";

vi.mock("@/util/SVGAssetLoader", () => ({
  loadSVGAndCreateBounds: vi.fn(() =>
    Promise.resolve({
      bounds: { width: 20, height: 10, refRatioPosition: { x: 0.5, y: 0.5 }, getAbsoluteBounds: vi.fn(), getBoundingPositions: vi.fn(), getRotatedBoundingPositions: vi.fn() },
      svgInfo: undefined,
    })
  ),
}));

const FAST_GUN: ShootingWeaponType = {
  name: "Test Gun",
  damage: 10,
  fireInterval: 100,
  bulletSpeed: 500,
  bulletSize: 2,
  size: 20,
  svgPath: "svg/test.svg",
  primaryHoldRatioPosition: { x: 0.5, y: 0.5 },
  secondaryHoldRatioPosition: null,
  muzzleRatioPosition: { x: 1.0, y: 0.5 },
  capacity: 5,
  autoFiringType: "auto",
};

const SEMI_AUTO: ShootingWeaponType = {
  ...FAST_GUN,
  name: "Semi Gun",
  autoFiringType: "semi-auto",
};

describe("ShootingWeapon", () => {
  let now: number;
  const getNow = () => now;
  const transform = new EntityTransform({ x: 100, y: 300 }, 0, 1);

  beforeEach(() => {
    now = 1000;
  });

  describe("canShoot - auto", () => {
    it("returns true when fire interval has passed and has ammo", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      expect(weapon.canShoot(true)).toBe(true);
    });

    it("returns true even without new trigger press (auto)", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      expect(weapon.canShoot(false)).toBe(true);
    });

    it("returns false when fire interval has not passed", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      weapon.shoot(transform, true); // shoots at t=1000
      now = 1050; // only 50ms < 100ms interval
      expect(weapon.canShoot(true)).toBe(false);
    });

    it("returns true after fire interval passes", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      weapon.shoot(transform, true);
      now = 1101; // 101ms > 100ms
      expect(weapon.canShoot(true)).toBe(true);
    });

    it("returns false when out of ammo", () => {
      const weapon = new ShootingWeapon({ ...FAST_GUN, capacity: 1 }, getNow);
      weapon.shoot(transform, true);
      now = 1200;
      expect(weapon.canShoot(true)).toBe(false);
    });
  });

  describe("canShoot - semi-auto", () => {
    it("requires new trigger press", () => {
      const weapon = new ShootingWeapon(SEMI_AUTO, getNow);
      expect(weapon.canShoot(false)).toBe(false);
      expect(weapon.canShoot(true)).toBe(true);
    });
  });

  describe("shoot", () => {
    it("returns a bullet on success", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      const bullets = weapon.shoot(transform, true);
      expect(bullets.length).toBe(1);
      expect(bullets[0].damage).toBe(FAST_GUN.damage);
    });

    it("decrements ammo", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      expect(weapon.getBulletsLeft()).toBe(5);
      weapon.shoot(transform, true);
      expect(weapon.getBulletsLeft()).toBe(4);
    });

    it("returns empty array when canShoot is false", () => {
      const weapon = new ShootingWeapon({ ...FAST_GUN, capacity: 0 }, getNow);
      expect(weapon.shoot(transform, true)).toEqual([]);
    });

    it("positions bullet at weapon end", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      const bullets = weapon.shoot(new EntityTransform({ x: 0, y: 0 }, 0, 1), true);
      // dx = width * (muzzle.x - grip.x) = 20 * (1.0 - 0.5) = 10, dy = 0
      // x = 0 + cos(0)*10*1 = 10, y = 0 + sin(0)*10 = 0
      expect(bullets[0].transform.position.x).toBeCloseTo(10);
      expect(bullets[0].transform.position.y).toBeCloseTo(0);
    });

    it("fires multiple pellets for shotgun weapons", () => {
      const shotgun = { ...FAST_GUN, pelletCount: 6, spreadAngle: 0.26, damageDropoff: { effectiveRange: 200, minDamageRatio: 0.1 } };
      const weapon = new ShootingWeapon(shotgun, getNow);
      const bullets = weapon.shoot(transform, true);
      expect(bullets.length).toBe(6);
      bullets.forEach(b => {
        expect(b.isPellet).toBe(true);
        expect(b.damage).toBeCloseTo(shotgun.damage / 6);
      });
    });
  });

  describe("reload", () => {
    it("restores ammo to capacity", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      weapon.shoot(transform, true);
      now += 200;
      weapon.shoot(transform, true);
      expect(weapon.getBulletsLeft()).toBe(3);
      weapon.reload();
      expect(weapon.getBulletsLeft()).toBe(5);
    });
  });

  describe("getCapacity", () => {
    it("returns weapon capacity", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      expect(weapon.getCapacity()).toBe(5);
    });
  });

  describe("getMuzzleTransform", () => {
    it("returns position at weapon tip for rotation=0, facing=1", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      const muzzle = weapon.getMuzzleTransform(new EntityTransform({ x: 100, y: 200 }, 0, 1));
      // dx = 20 * (1.0 - 0.5) = 10, dy = 0
      // x = 100 + cos(0)*10*1 = 110, y = 200 + sin(0)*10 = 200
      expect(muzzle.position.x).toBeCloseTo(110);
      expect(muzzle.position.y).toBeCloseTo(200);
    });

    it("flips x-offset when facing left", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      const muzzle = weapon.getMuzzleTransform(new EntityTransform({ x: 100, y: 200 }, 0, -1));
      // dx = 10, x = 100 + cos(0)*10*(-1) = 90
      expect(muzzle.position.x).toBeCloseTo(90);
      expect(muzzle.position.y).toBeCloseTo(200);
    });

    it("applies rotation to offset", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      const muzzle = weapon.getMuzzleTransform(new EntityTransform({ x: 0, y: 0 }, Math.PI / 2, 1));
      // dx = 10, dy = 0
      // x = (cos(π/2)*10 - sin(π/2)*0)*1 ≈ 0, y = sin(π/2)*10 + cos(π/2)*0 = 10
      expect(muzzle.position.x).toBeCloseTo(0);
      expect(muzzle.position.y).toBeCloseTo(10);
    });

    it("preserves rotation and facing in returned transform", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      const muzzle = weapon.getMuzzleTransform(new EntityTransform({ x: 0, y: 0 }, 1.5, -1));
      expect(muzzle.rotation).toBe(1.5);
      expect(muzzle.facing).toBe(-1);
    });
  });
});
