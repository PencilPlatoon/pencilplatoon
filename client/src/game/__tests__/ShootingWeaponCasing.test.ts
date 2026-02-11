import { describe, it, expect, vi } from "vitest";
import { ShootingWeapon } from "@/game/weapons/ShootingWeapon";
import { ShootingWeaponType } from "@/game/types/interfaces";
import { EntityTransform } from "@/game/types/EntityTransform";

vi.mock("@/util/SVGAssetLoader", () => ({
  loadSVGAndCreateBounds: vi.fn(() =>
    Promise.resolve({
      bounds: {
        width: 50,
        height: 10,
        refRatioPosition: { x: 0.3, y: 0.5 },
        getAbsoluteBounds: vi.fn(),
        getBoundingPositions: vi.fn(),
        getRotatedBoundingPositions: vi.fn(),
      },
      svgInfo: undefined,
    })
  ),
}));

const makeWeaponType = (overrides: Partial<ShootingWeaponType> = {}): ShootingWeaponType => ({
  name: "Test Rifle",
  damage: 30,
  fireInterval: 200,
  bulletSpeed: 800,
  bulletSize: 3,
  size: 50,
  svgPath: "svg/test.svg",
  primaryHoldRatioPosition: { x: 0.3, y: 0.5 },
  secondaryHoldRatioPosition: { x: 0.6, y: 0.5 },
  muzzleRatioPosition: { x: 1.0, y: 0.5 },
  capacity: 30,
  autoFiringType: 'auto',
  ...overrides,
});

describe("ShootingWeapon casing ejection", () => {
  describe("getPointAlongBarrel", () => {
    it("returns muzzle position (validates refactor)", () => {
      const weapon = new ShootingWeapon(makeWeaponType());
      const wt = new EntityTransform({ x: 100, y: 200 }, 0, 1);
      const muzzleViaPoint = weapon.getPointAlongBarrel(wt, weapon.type.muzzleRatioPosition);
      const muzzleDirect = weapon.getMuzzleTransform(wt);
      expect(muzzleViaPoint.position.x).toBeCloseTo(muzzleDirect.position.x);
      expect(muzzleViaPoint.position.y).toBeCloseTo(muzzleDirect.position.y);
    });
  });

  describe("getEjectionPortTransform", () => {
    it("returns position between grip and muzzle", () => {
      const weapon = new ShootingWeapon(makeWeaponType());
      const wt = new EntityTransform({ x: 100, y: 200 }, 0, 1);
      const grip = wt;
      const muzzle = weapon.getMuzzleTransform(wt);
      const ejection = weapon.getEjectionPortTransform(wt);

      // Ejection port x should be between grip and muzzle
      expect(ejection.position.x).toBeGreaterThan(grip.position.x);
      expect(ejection.position.x).toBeLessThan(muzzle.position.x);
    });

    it("respects rotation", () => {
      const weapon = new ShootingWeapon(makeWeaponType());
      const wt0 = new EntityTransform({ x: 100, y: 200 }, 0, 1);
      const wtUp = new EntityTransform({ x: 100, y: 200 }, Math.PI / 4, 1);

      const ej0 = weapon.getEjectionPortTransform(wt0);
      const ejUp = weapon.getEjectionPortTransform(wtUp);

      // When aiming up, ejection port should be higher
      expect(ejUp.position.y).toBeGreaterThan(ej0.position.y);
    });

    it("respects facing", () => {
      const weapon = new ShootingWeapon(makeWeaponType());
      const wtRight = new EntityTransform({ x: 100, y: 200 }, 0, 1);
      const wtLeft = new EntityTransform({ x: 100, y: 200 }, 0, -1);

      const ejRight = weapon.getEjectionPortTransform(wtRight);
      const ejLeft = weapon.getEjectionPortTransform(wtLeft);

      // Ejection port should mirror horizontally
      expect(ejRight.position.x).toBeGreaterThan(100);
      expect(ejLeft.position.x).toBeLessThan(100);
    });
  });

  describe("getCasingEjection", () => {
    it("returns rifle config by default", () => {
      const weapon = new ShootingWeapon(makeWeaponType());
      const wt = new EntityTransform({ x: 100, y: 200 }, 0, 1);
      const ejection = weapon.getCasingEjection(wt);
      expect(ejection).not.toBeNull();
      expect(ejection!.config.width).toBe(6); // rifle width
    });

    it("returns pistol config for pistol category", () => {
      const weapon = new ShootingWeapon(makeWeaponType({ casingCategory: 'pistol' }));
      const wt = new EntityTransform({ x: 100, y: 200 }, 0, 1);
      const ejection = weapon.getCasingEjection(wt);
      expect(ejection!.config.width).toBe(4); // pistol width
    });

    it("returns shotgun config for shotgun category", () => {
      const weapon = new ShootingWeapon(makeWeaponType({ casingCategory: 'shotgun' }));
      const wt = new EntityTransform({ x: 100, y: 200 }, 0, 1);
      const ejection = weapon.getCasingEjection(wt);
      expect(ejection!.config.width).toBe(8); // shotgun width
    });

    it("ejection direction is perpendicular to barrel when facing right", () => {
      const weapon = new ShootingWeapon(makeWeaponType());
      const wt = new EntityTransform({ x: 100, y: 200 }, 0, 1);
      const ejection = weapon.getCasingEjection(wt);

      // Barrel angle is 0 (horizontal right), ejection should be +90° = upward
      expect(ejection!.direction.x).toBeCloseTo(0);
      expect(ejection!.direction.y).toBeCloseTo(1);
    });

    it("ejection direction correct when facing left", () => {
      const weapon = new ShootingWeapon(makeWeaponType());
      const wt = new EntityTransform({ x: 100, y: 200 }, 0, -1);
      const ejection = weapon.getCasingEjection(wt);

      // Barrel angle is 0, facing left, ejection should be -90° = downward in angle
      // but since facing=-1, ejection angle = 0 + (π/2)*(-1) = -π/2 → direction (0, -1)
      expect(ejection!.direction.x).toBeCloseTo(0);
      expect(ejection!.direction.y).toBeCloseTo(-1);
    });
  });
});
