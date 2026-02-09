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
      const bullet = weapon.shoot(transform, true);
      expect(bullet).not.toBeNull();
      expect(bullet!.damage).toBe(FAST_GUN.damage);
    });

    it("decrements ammo", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      expect(weapon.getBulletsLeft()).toBe(5);
      weapon.shoot(transform, true);
      expect(weapon.getBulletsLeft()).toBe(4);
    });

    it("returns null when canShoot is false", () => {
      const weapon = new ShootingWeapon({ ...FAST_GUN, capacity: 0 }, getNow);
      expect(weapon.shoot(transform, true)).toBeNull();
    });

    it("positions bullet at weapon end", () => {
      const weapon = new ShootingWeapon(FAST_GUN, getNow);
      const bullet = weapon.shoot(new EntityTransform({ x: 0, y: 0 }, 0, 1), true);
      // x = 0 + cos(0)*20*1 = 20, y = 0 + sin(0)*20 = 0
      expect(bullet!.transform.position.x).toBeCloseTo(20);
      expect(bullet!.transform.position.y).toBeCloseTo(0);
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
});
