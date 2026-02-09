import { describe, it, expect, vi, beforeEach } from "vitest";
import { cycleIndex, Arsenal } from "../Arsenal";
import { Rocket } from "../Rocket";
import { BoundingBox } from "../BoundingBox";
import { EntityTransform } from "../EntityTransform";
import { ALL_SHOOTING_WEAPONS, ALL_LAUNCHERS, ALL_GRENADES } from "../WeaponCatalog";

vi.mock("@/util/SVGAssetLoader", () => ({
  loadSVGAndCreateBounds: vi.fn(() =>
    Promise.resolve({
      bounds: new BoundingBox(20, 10, { x: 0.5, y: 0.5 }),
      svgInfo: undefined,
    })
  ),
}));

describe("cycleIndex", () => {
  it("advances index by one", () => {
    expect(cycleIndex(0, 3)).toBe(1);
    expect(cycleIndex(1, 3)).toBe(2);
  });

  it("wraps around to zero at the end", () => {
    expect(cycleIndex(2, 3)).toBe(0);
  });

  it("works with a single-element array", () => {
    expect(cycleIndex(0, 1)).toBe(0);
  });
});

describe("Arsenal", () => {
  let arsenal: Arsenal;

  beforeEach(() => {
    arsenal = new Arsenal();
  });

  describe("constructor", () => {
    it("starts with default weapon indices", () => {
      expect(arsenal.currentWeaponIndex).toBe(0);
      expect(arsenal.currentLauncherIndex).toBe(0);
      expect(arsenal.currentGrenadeIndex).toBe(0);
    });

    it("starts with full grenades and rockets", () => {
      expect(arsenal.grenadeCount).toBe(50);
      expect(arsenal.maxGrenades).toBe(50);
      expect(arsenal.rocketCount).toBe(3);
    });

    it("starts with no reloading rocket", () => {
      expect(arsenal.reloadingRocket).toBeNull();
    });
  });

  describe("switchToNextWeapon", () => {
    it("cycles the weapon index", () => {
      const initialIndex = arsenal.currentWeaponIndex;
      arsenal.switchToNextWeapon();
      const expectedIndex = (initialIndex + 1) % ALL_SHOOTING_WEAPONS.length;
      expect(arsenal.currentWeaponIndex).toBe(expectedIndex);
    });

    it("creates a new ShootingWeapon instance", () => {
      const originalWeapon = arsenal.heldShootingWeapon;
      arsenal.switchToNextWeapon();
      expect(arsenal.heldShootingWeapon).not.toBe(originalWeapon);
    });

    it("wraps around to index 0", () => {
      for (let i = 0; i < ALL_SHOOTING_WEAPONS.length; i++) {
        arsenal.switchToNextWeapon();
      }
      expect(arsenal.currentWeaponIndex).toBe(0);
    });
  });

  describe("switchToNextLauncher", () => {
    it("cycles the launcher index", () => {
      const initialIndex = arsenal.currentLauncherIndex;
      arsenal.switchToNextLauncher();
      const expectedIndex = (initialIndex + 1) % ALL_LAUNCHERS.length;
      expect(arsenal.currentLauncherIndex).toBe(expectedIndex);
    });

    it("creates a new LaunchingWeapon instance", () => {
      const originalLauncher = arsenal.heldLaunchingWeapon;
      arsenal.switchToNextLauncher();
      expect(arsenal.heldLaunchingWeapon).not.toBe(originalLauncher);
    });
  });

  describe("switchToNextGrenade", () => {
    it("cycles the grenade index", () => {
      const initialIndex = arsenal.currentGrenadeIndex;
      arsenal.switchToNextGrenade();
      const expectedIndex = (initialIndex + 1) % ALL_GRENADES.length;
      expect(arsenal.currentGrenadeIndex).toBe(expectedIndex);
    });

    it("creates a new Grenade instance", () => {
      const originalGrenade = arsenal.heldGrenade;
      arsenal.switchToNextGrenade();
      expect(arsenal.heldGrenade).not.toBe(originalGrenade);
    });
  });

  describe("startReloadingRocket", () => {
    it("creates a reloading rocket held by the player", () => {
      const mockHolder = {
        getPrimaryHandAbsTransform: () => new EntityTransform({ x: 0, y: 0 }),
        getAbsoluteBounds: vi.fn(),
      };
      arsenal.startReloadingRocket(mockHolder as any);
      expect(arsenal.reloadingRocket).not.toBeNull();
      expect(arsenal.reloadingRocket).toBeInstanceOf(Rocket);
    });
  });

  describe("transferRocketToLauncher", () => {
    it("transfers rocket from reloading to launcher", () => {
      const mockHolder = {
        getPrimaryHandAbsTransform: () => new EntityTransform({ x: 0, y: 0 }),
        getAbsoluteBounds: vi.fn(),
      };
      // Clear existing loaded rocket
      arsenal.heldLaunchingWeapon.heldRocket = null;

      arsenal.startReloadingRocket(mockHolder as any);
      const reloadingRocket = arsenal.reloadingRocket;
      expect(reloadingRocket).not.toBeNull();

      arsenal.transferRocketToLauncher();

      expect(arsenal.reloadingRocket).toBeNull();
      expect(arsenal.heldLaunchingWeapon.heldRocket).toBe(reloadingRocket);
    });

    it("sets rocket holder to the launcher", () => {
      const mockHolder = {
        getPrimaryHandAbsTransform: () => new EntityTransform({ x: 0, y: 0 }),
        getAbsoluteBounds: vi.fn(),
      };
      arsenal.heldLaunchingWeapon.heldRocket = null;
      arsenal.startReloadingRocket(mockHolder as any);
      arsenal.transferRocketToLauncher();

      expect(arsenal.heldLaunchingWeapon.heldRocket!.holder).toBe(arsenal.heldLaunchingWeapon);
    });

    it("does nothing when no reloading rocket", () => {
      arsenal.reloadingRocket = null;
      const existingRocket = arsenal.heldLaunchingWeapon.heldRocket;
      arsenal.transferRocketToLauncher();
      expect(arsenal.heldLaunchingWeapon.heldRocket).toBe(existingRocket);
    });
  });

  describe("reset", () => {
    it("resets all indices to 0", () => {
      arsenal.switchToNextWeapon();
      arsenal.switchToNextGrenade();
      arsenal.switchToNextLauncher();
      arsenal.reset();
      expect(arsenal.currentWeaponIndex).toBe(0);
      expect(arsenal.currentLauncherIndex).toBe(0);
      expect(arsenal.currentGrenadeIndex).toBe(0);
    });

    it("restores grenade count to max", () => {
      arsenal.grenadeCount = 5;
      arsenal.reset();
      expect(arsenal.grenadeCount).toBe(arsenal.maxGrenades);
    });

    it("restores rocket count to 3", () => {
      arsenal.rocketCount = 0;
      arsenal.reset();
      expect(arsenal.rocketCount).toBe(3);
    });

    it("clears reloading rocket", () => {
      const mockHolder = {
        getPrimaryHandAbsTransform: () => new EntityTransform({ x: 0, y: 0 }),
        getAbsoluteBounds: vi.fn(),
      };
      arsenal.startReloadingRocket(mockHolder as any);
      arsenal.reset();
      expect(arsenal.reloadingRocket).toBeNull();
    });

    it("creates fresh weapon instances", () => {
      const oldWeapon = arsenal.heldShootingWeapon;
      const oldLauncher = arsenal.heldLaunchingWeapon;
      const oldGrenade = arsenal.heldGrenade;
      arsenal.reset();
      expect(arsenal.heldShootingWeapon).not.toBe(oldWeapon);
      expect(arsenal.heldLaunchingWeapon).not.toBe(oldLauncher);
      expect(arsenal.heldGrenade).not.toBe(oldGrenade);
    });
  });
});
