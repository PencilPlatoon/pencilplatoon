import { describe, it, expect, vi, beforeEach } from "vitest";
import { Player, getThrowMultiplier } from "../Player";
import { Terrain } from "../Terrain";

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

    it("setThrowPower stores power value", () => {
      player.setThrowPower(0.75);
      // We can't directly read throwPower but we can verify startThrow uses it
      // Just verify it doesn't throw
      expect(() => player.setThrowPower(0.5)).not.toThrow();
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
});
