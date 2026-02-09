import { describe, it, expect, vi, beforeEach } from "vitest";
import { Player, getThrowMultiplier } from "../Player";
import { Terrain } from "../Terrain";
import { LaunchingWeapon } from "../LaunchingWeapon";

vi.mock("@/util/SVGAssetLoader", () => ({
  loadSVGAndCreateBounds: vi.fn(() =>
    Promise.resolve({
      bounds: {
        width: 20,
        height: 10,
        refRatioPosition: { x: 0.5, y: 0.5 },
        getAbsoluteBounds: vi.fn(),
        getBoundingPositions: vi.fn(),
        getRotatedBoundingPositions: vi.fn(),
      },
      svgInfo: undefined,
    })
  ),
}));

const noInput = {
  left: false,
  right: false,
  up: false,
  down: false,
  jump: false,
  triggerPressed: false,
  aimUp: false,
  aimDown: false,
};

const terrainHeight = 100;
const mockTerrain = {
  getHeightAt: () => terrainHeight,
  getLevelWidth: () => 8000,
} as unknown as Terrain;

describe("getThrowMultiplier", () => {
  it("maps 0 power to 0.2", () => {
    expect(getThrowMultiplier(0)).toBeCloseTo(0.2);
  });

  it("maps 1.0 power to 1.0", () => {
    expect(getThrowMultiplier(1.0)).toBeCloseTo(1.0);
  });

  it("maps 0.5 power to 0.6", () => {
    expect(getThrowMultiplier(0.5)).toBeCloseTo(0.6);
  });

  it("scales linearly", () => {
    const a = getThrowMultiplier(0.25);
    const b = getThrowMultiplier(0.75);
    expect(a).toBeCloseTo(0.4);
    expect(b).toBeCloseTo(0.8);
  });
});

describe("Player", () => {
  let player: Player;

  beforeEach(() => {
    player = new Player(100, 200);
  });

  describe("constructor / reset", () => {
    it("initializes with max health", () => {
      expect(player.health).toBe(Player.MAX_HEALTH);
    });

    it("initializes as active", () => {
      expect(player.active).toBe(true);
    });

    it("clamps x to at least 50", () => {
      const p = new Player(10, 200);
      expect(p.transform.position.x).toBeGreaterThanOrEqual(50);
    });

    it("reset restores health and active state", () => {
      player.takeDamage(50);
      player.reset(100, 200);
      expect(player.health).toBe(Player.MAX_HEALTH);
      expect(player.active).toBe(true);
    });
  });

  describe("takeDamage", () => {
    it("reduces health", () => {
      player.takeDamage(30);
      expect(player.health).toBe(Player.MAX_HEALTH - 30);
    });

    it("clamps health at 0", () => {
      player.takeDamage(9999);
      expect(player.health).toBe(0);
    });

    it("deactivates on death", () => {
      player.takeDamage(Player.MAX_HEALTH);
      expect(player.active).toBe(false);
    });
  });

  describe("switchWeaponCategory", () => {
    it("cycles gun → grenade → launcher → gun", () => {
      expect(player.getSelectedWeaponCategory()).toBe("gun");
      player.switchWeaponCategory();
      expect(player.getSelectedWeaponCategory()).toBe("grenade");
      player.switchWeaponCategory();
      expect(player.getSelectedWeaponCategory()).toBe("launcher");
      player.switchWeaponCategory();
      expect(player.getSelectedWeaponCategory()).toBe("gun");
    });
  });

  describe("switchWeaponInCategory", () => {
    it("switches gun within category", () => {
      const originalWeapon = player.arsenal.heldShootingWeapon;
      player.switchWeaponInCategory();
      expect(player.arsenal.heldShootingWeapon).not.toBe(originalWeapon);
    });

    it("switches grenade within category", () => {
      player.switchWeaponCategory(); // to grenade
      const originalGrenade = player.arsenal.heldGrenade;
      player.switchWeaponInCategory();
      expect(player.arsenal.heldGrenade).not.toBe(originalGrenade);
    });

    it("switches launcher within category and sets holder", () => {
      player.switchWeaponCategory(); // to grenade
      player.switchWeaponCategory(); // to launcher
      player.switchWeaponInCategory();
      expect(player.arsenal.heldLaunchingWeapon.holder).toBe(player);
    });
  });

  describe("movement via update", () => {
    it("moves right when right input is pressed", () => {
      const startX = player.transform.position.x;
      player.update(0.1, { ...noInput, right: true }, mockTerrain);
      expect(player.transform.position.x).toBeGreaterThan(startX);
    });

    it("moves left when left input is pressed", () => {
      player.transform.position.x = 200; // Ensure room to move left
      const startX = player.transform.position.x;
      player.update(0.1, { ...noInput, left: true }, mockTerrain);
      expect(player.transform.position.x).toBeLessThan(startX);
    });

    it("clamps x position to at least 50", () => {
      player.transform.position.x = 51;
      player.update(0.1, { ...noInput, left: true }, mockTerrain);
      expect(player.transform.position.x).toBeGreaterThanOrEqual(50);
    });

    it("faces right when moving right", () => {
      player.update(0.1, { ...noInput, right: true }, mockTerrain);
      expect(player.transform.facing).toBe(1);
    });

    it("faces left when moving left", () => {
      player.update(0.1, { ...noInput, left: true }, mockTerrain);
      expect(player.transform.facing).toBe(-1);
    });
  });

  describe("aim clamping", () => {
    it("aims up when aimUp is pressed", () => {
      // Run multiple updates to accumulate aim angle
      for (let i = 0; i < 10; i++) {
        player.update(0.1, { ...noInput, aimUp: true }, mockTerrain);
      }
      // Aim angle should be positive (looking up) and clamped to π/3
      const maxAngle = Math.PI / 3;
      // Access aim through getPrimaryHandAbsTransform
      // The angle should be clamped
      expect(player.getPrimaryHandAbsTransform().rotation).toBeGreaterThan(0);
      expect(player.getPrimaryHandAbsTransform().rotation).toBeLessThanOrEqual(maxAngle + 0.01);
    });

    it("aims down when aimDown is pressed", () => {
      for (let i = 0; i < 10; i++) {
        player.update(0.1, { ...noInput, aimDown: true }, mockTerrain);
      }
      expect(player.getPrimaryHandAbsTransform().rotation).toBeLessThan(0);
      expect(player.getPrimaryHandAbsTransform().rotation).toBeGreaterThanOrEqual(-Math.PI / 3 - 0.01);
    });
  });

  describe("terrain collision", () => {
    it("snaps to terrain when falling", () => {
      player.transform.position.y = 50; // below terrain at 100
      player.velocity.y = -100; // falling
      player.update(0.016, noInput, mockTerrain);
      expect(player.transform.position.y).toBeGreaterThanOrEqual(terrainHeight);
    });
  });

  describe("grenade operations", () => {
    it("canStartThrow returns true when grenades available", () => {
      expect(player.canStartThrow()).toBe(true);
    });

    it("canStartThrow returns false when no grenades", () => {
      player.arsenal.grenadeCount = 0;
      expect(player.canStartThrow()).toBe(false);
    });

    it("setThrowPower stores power value", () => {
      player.setThrowPower(0.75);
      // We can't directly read throwPower but we can verify startThrow uses it
      // Just verify it doesn't throw
      expect(() => player.setThrowPower(0.5)).not.toThrow();
    });
  });

  describe("startThrow", () => {
    it("decrements grenade count", () => {
      const before = player.getGrenadeCount();
      player.setThrowPower(0.5);
      player.startThrow();
      expect(player.getGrenadeCount()).toBe(before - 1);
    });

    it("does nothing when no grenades", () => {
      player.arsenal.grenadeCount = 0;
      player.setThrowPower(0.5);
      player.startThrow();
      expect(player.getGrenadeCount()).toBe(0);
    });
  });

  describe("grenade throw flow", () => {
    it("completes throw via update cycle", () => {
      vi.useFakeTimers();
      try {
        // Create player AFTER fake timers so ThrowGrenadeMovement captures mocked Date.now
        const p = new Player(100, 200);

        // Switch to grenade category
        p.switchWeaponCategory(); // gun → grenade
        expect(p.getSelectedWeaponCategory()).toBe("grenade");

        // Set throw power and start throw
        p.setThrowPower(0.8);
        p.startThrow();

        // Initially no completed grenade
        expect(p.getCompletedGrenadeThrow()).toBeNull();

        // Advance fake time past 300ms animation duration
        vi.advanceTimersByTime(350);

        // Run an update so the throw completion is detected
        p.update(0.016, noInput, mockTerrain);

        // After animation completes, getCompletedGrenadeThrow should return the grenade
        const grenade = p.getCompletedGrenadeThrow();
        expect(grenade).not.toBeNull();
        expect(grenade!.active).toBe(true);
        expect(grenade!.velocity.x).not.toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("getCompletedGrenadeThrow clears after retrieval", () => {
      vi.useFakeTimers();
      try {
        const p = new Player(100, 200);
        p.switchWeaponCategory(); // gun → grenade
        p.setThrowPower(0.8);
        p.startThrow();

        // Advance fake time past animation duration
        vi.advanceTimersByTime(350);
        p.update(0.016, noInput, mockTerrain);

        // First retrieval returns grenade
        const grenade = p.getCompletedGrenadeThrow();
        expect(grenade).not.toBeNull();

        // Second retrieval returns null (cleared)
        expect(p.getCompletedGrenadeThrow()).toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("launch", () => {
    it("returns a rocket on new trigger press", () => {
      player.switchWeaponCategory(); // gun → grenade
      player.switchWeaponCategory(); // grenade → launcher
      const rocket = player.launch(true);
      expect(rocket).not.toBeNull();
      expect(rocket!.isLaunched).toBe(true);
    });

    it("decrements rocket count", () => {
      player.switchWeaponCategory(); // gun → grenade
      player.switchWeaponCategory(); // grenade → launcher
      const before = player.getRocketsLeft();
      player.launch(true);
      expect(player.getRocketsLeft()).toBe(before - 1);
    });

    it("returns null without new trigger press", () => {
      player.switchWeaponCategory(); // gun → grenade
      player.switchWeaponCategory(); // grenade → launcher
      expect(player.launch(false)).toBeNull();
    });

    it("auto-reloads when rockets remain after launch", () => {
      player.switchWeaponCategory(); // gun → grenade
      player.switchWeaponCategory(); // grenade → launcher
      expect(player.getRocketsLeft()).toBe(3);

      player.launch(true);
      // Should have started reloading (rocketCount = 2 > 0)
      expect(player.arsenal.reloadingRocket).not.toBeNull();
    });

    it("does not auto-reload when no rockets remain", () => {
      player.switchWeaponCategory(); // gun → grenade
      player.switchWeaponCategory(); // grenade → launcher
      player.arsenal.rocketCount = 1; // only 1 left

      player.launch(true);
      // After launch, rocketCount = 0, no auto-reload
      expect(player.getRocketsLeft()).toBe(0);
      expect(player.arsenal.reloadingRocket).toBeNull();
    });
  });

  describe("reload", () => {
    it("reloads gun weapon", () => {
      // Deplete ammo first
      player.arsenal.heldShootingWeapon.bulletsLeft = 0;
      player.reload();
      expect(player.arsenal.heldShootingWeapon.bulletsLeft).toBe(
        player.arsenal.heldShootingWeapon.type.capacity
      );
    });

    it("starts launcher reload when rockets available", () => {
      player.switchWeaponCategory(); // gun → grenade
      player.switchWeaponCategory(); // grenade → launcher
      // Clear the loaded rocket so reload is needed
      player.arsenal.heldLaunchingWeapon.heldRocket = null;

      player.reload();
      expect(player.arsenal.reloadingRocket).not.toBeNull();
    });

    it("does not reload launcher when already loaded", () => {
      player.switchWeaponCategory(); // gun → grenade
      player.switchWeaponCategory(); // grenade → launcher
      // Launcher already has a rocket from constructor
      expect(player.arsenal.heldLaunchingWeapon.heldRocket).not.toBeNull();

      player.reload();
      // reloadingRocket should still be null since launcher is already loaded
      expect(player.arsenal.reloadingRocket).toBeNull();
    });

    it("does not reload launcher when no rockets in inventory", () => {
      player.switchWeaponCategory(); // gun → grenade
      player.switchWeaponCategory(); // grenade → launcher
      player.arsenal.heldLaunchingWeapon.heldRocket = null;
      player.arsenal.rocketCount = 0;

      player.reload();
      expect(player.arsenal.reloadingRocket).toBeNull();
    });
  });

  describe("getEntityLabel", () => {
    it("returns 'Player'", () => {
      expect(player.getEntityLabel()).toBe("Player");
    });
  });

  describe("getBulletExplosionParameters", () => {
    it("returns valid parameters", () => {
      const params = player.getBulletExplosionParameters();
      expect(params.colors.length).toBeGreaterThan(0);
      expect(params.particleCount).toBeGreaterThan(0);
      expect(params.radius).toBeGreaterThan(0);
    });
  });

  describe("getAbsoluteBounds", () => {
    it("returns bounds relative to position", () => {
      const bounds = player.getAbsoluteBounds();
      expect(bounds.upperLeft.x).toBeLessThan(player.transform.position.x);
      expect(bounds.lowerRight.x).toBeGreaterThan(player.transform.position.x);
    });
  });

  describe("weapon accessors", () => {
    it("getGrenadeCount returns grenade count", () => {
      expect(player.getGrenadeCount()).toBeGreaterThan(0);
    });

    it("getMaxGrenades returns max grenades", () => {
      expect(player.getMaxGrenades()).toBeGreaterThan(0);
    });

    it("getRocketsLeft returns rocket count", () => {
      expect(player.getRocketsLeft()).toBeGreaterThan(0);
    });

    it("getHeldObject returns the current weapon", () => {
      const held = player.getHeldObject();
      expect(held).toBeDefined();
      expect(held.type).toBeDefined();
      expect(held.type.name).toBeDefined();
    });
  });

  describe("getCenterOfGravity", () => {
    it("returns center point above feet", () => {
      const cog = player.getCenterOfGravity();
      expect(cog.x).toBeCloseTo(player.transform.position.x);
      expect(cog.y).toBeGreaterThan(player.transform.position.y);
    });
  });
});
