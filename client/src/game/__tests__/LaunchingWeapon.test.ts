import { describe, it, expect, vi, beforeEach } from "vitest";
import { LaunchingWeapon } from "../weapons/LaunchingWeapon";
import { Rocket } from "../entities/Rocket";
import { EntityTransform } from "../types/EntityTransform";
import { BoundingBox } from "../types/BoundingBox";
import { RPG_8 } from "../weapons/WeaponCatalog";

vi.mock("@/util/SVGAssetLoader", () => ({
  loadSVGAndCreateBounds: vi.fn(() =>
    Promise.resolve({
      bounds: new BoundingBox(50, 10, { x: 0.5, y: 0.5 }),
      svgInfo: undefined,
    })
  ),
}));

describe("LaunchingWeapon", () => {
  let launcher: LaunchingWeapon;
  const transform = new EntityTransform({ x: 100, y: 300 }, 0, 1);

  beforeEach(() => {
    launcher = new LaunchingWeapon(RPG_8);
  });

  describe("canLaunch", () => {
    it("returns true when has rocket and new trigger press", () => {
      expect(launcher.canLaunch(true)).toBe(true);
    });

    it("returns false without new trigger press", () => {
      expect(launcher.canLaunch(false)).toBe(false);
    });

    it("returns false when no rocket loaded", () => {
      launcher.launch(transform); // remove rocket
      expect(launcher.canLaunch(true)).toBe(false);
    });
  });

  describe("launch", () => {
    it("returns the launched rocket", () => {
      const rocket = launcher.launch(transform);
      expect(rocket).not.toBeNull();
      expect(rocket!.isLaunched).toBe(true);
    });

    it("clears held rocket after launch", () => {
      launcher.launch(transform);
      expect(launcher.heldRocket).toBeNull();
    });

    it("returns null when no rocket loaded", () => {
      launcher.launch(transform);
      expect(launcher.launch(transform)).toBeNull();
    });

    it("sets rocket velocity based on rocket type speed", () => {
      const rocket = launcher.launch(new EntityTransform({ x: 0, y: 0 }, 0, 1));
      // cos(0)*1 * speed, sin(0) * speed
      expect(rocket!.velocity.x).toBeCloseTo(launcher.rocketType.speed);
      expect(rocket!.velocity.y).toBeCloseTo(0);
    });
  });

  describe("getMuzzleTransform", () => {
    it("returns transform at the right edge of weapon", () => {
      const muzzle = launcher.getMuzzleTransform(new EntityTransform({ x: 0, y: 0 }, 0, 1));
      // distanceToRightEdge = (1 - 0.5) * width
      // default bounds width is 50 (from launcher type size), ref at 0.5
      // endX = 0 + cos(0) * 25 * 1 = 25
      expect(muzzle.position.x).toBeCloseTo(25);
      expect(muzzle.position.y).toBeCloseTo(0);
    });

    it("accounts for rotation", () => {
      const muzzle = launcher.getMuzzleTransform(
        new EntityTransform({ x: 0, y: 0 }, Math.PI / 2, 1)
      );
      // cos(pi/2) ~ 0, sin(pi/2) ~ 1
      expect(muzzle.position.x).toBeCloseTo(0, 0);
      expect(muzzle.position.y).toBeCloseTo(25, 0);
    });

    it("accounts for facing", () => {
      const muzzle = launcher.getMuzzleTransform(
        new EntityTransform({ x: 0, y: 0 }, 0, -1)
      );
      // endX = 0 + cos(0) * 25 * (-1) = -25
      expect(muzzle.position.x).toBeCloseTo(-25);
    });
  });

  describe("loadRocket", () => {
    it("sets the held rocket", () => {
      launcher.launch(transform); // clear rocket
      expect(launcher.heldRocket).toBeNull();

      const newRocket = new Rocket(0, 0, { x: 0, y: 0 });
      launcher.loadRocket(newRocket);
      expect(launcher.heldRocket).toBe(newRocket);
    });
  });

  describe("getCapacity", () => {
    it("returns launcher capacity", () => {
      expect(launcher.getCapacity()).toBe(1);
    });
  });

  describe("getAbsoluteBounds", () => {
    it("uses holder transform when holder is set", () => {
      const holderTransform = new EntityTransform({ x: 500, y: 400 }, 0, 1);
      launcher.holder = {
        getPrimaryHandAbsTransform: () => holderTransform,
      } as any;

      const bounds = launcher.getAbsoluteBounds();
      // Bounds should be based on holder position (500), not self position (0)
      expect(bounds.upperLeft.x).toBeCloseTo(500 - launcher.bounds.width * launcher.bounds.refRatioPosition.x);
      expect(bounds.lowerRight.x).toBeCloseTo(500 + launcher.bounds.width * (1 - launcher.bounds.refRatioPosition.x));
    });

    it("uses own transform when no holder", () => {
      launcher.holder = null;
      launcher.transform.setPosition(300, 200);

      const bounds = launcher.getAbsoluteBounds();
      // Bounds should be based on self position (300)
      expect(bounds.upperLeft.x).toBeCloseTo(300 - launcher.bounds.width * launcher.bounds.refRatioPosition.x);
      expect(bounds.lowerRight.x).toBeCloseTo(300 + launcher.bounds.width * (1 - launcher.bounds.refRatioPosition.x));
    });
  });

  describe("getPrimaryHandAbsTransform", () => {
    it("returns muzzle transform based on holder", () => {
      const holderTransform = new EntityTransform({ x: 100, y: 200 }, 0, 1);
      launcher.holder = {
        getPrimaryHandAbsTransform: () => holderTransform,
      } as any;

      const result = launcher.getPrimaryHandAbsTransform();
      // Should be at the muzzle (right edge) of the weapon
      expect(result.position.x).toBeGreaterThan(100);
    });

    it("uses own transform when no holder", () => {
      launcher.holder = null;
      launcher.transform.setPosition(100, 200);

      const result = launcher.getPrimaryHandAbsTransform();
      // Muzzle position from self transform
      expect(result.position.x).toBeGreaterThan(100);
    });
  });

  describe("updatePrimaryHoldRatioPosition", () => {
    it("updates the type and bounds ref position", () => {
      const newPos = { x: 0.3, y: 0.7 };
      launcher.updatePrimaryHoldRatioPosition(newPos);
      expect(launcher.type.primaryHoldRatioPosition).toEqual(newPos);
      expect(launcher.bounds.refRatioPosition).toEqual(newPos);
    });
  });

  describe("updateSecondaryHoldRatioPosition", () => {
    it("updates the type secondary hold position", () => {
      const newPos = { x: 0.8, y: 0.2 };
      launcher.updateSecondaryHoldRatioPosition(newPos);
      expect(launcher.type.secondaryHoldRatioPosition).toEqual(newPos);
    });
  });
});
