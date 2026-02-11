import { describe, it, expect, vi, beforeEach } from "vitest";
import { Enemy } from "@/game/entities/Enemy";
import { Terrain } from "@/game/world/Terrain";

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

describe("Enemy", () => {
  let now: number;
  const getNow = () => now;
  const terrainHeight = 100;
  const mockTerrain = {
    getHeightAt: () => terrainHeight,
    getLevelWidth: () => 8000,
  } as unknown as Terrain;

  beforeEach(() => {
    now = 1000;
  });

  describe("constructor", () => {
    it("initializes with correct position and health", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      expect(enemy.transform.position.x).toBe(500);
      expect(enemy.transform.position.y).toBe(100);
      expect(enemy.health).toBe(Enemy.MAX_HEALTH);
      expect(enemy.active).toBe(true);
    });
  });

  describe("takeDamage", () => {
    it("reduces health by damage amount", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      enemy.takeDamage(20);
      expect(enemy.health).toBe(Enemy.MAX_HEALTH - 20);
    });

    it("clamps health at 0", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      enemy.takeDamage(9999);
      expect(enemy.health).toBe(0);
    });

    it("deactivates when health reaches 0", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      enemy.takeDamage(Enemy.MAX_HEALTH);
      expect(enemy.active).toBe(false);
    });

    it("stays active when health is above 0", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      enemy.takeDamage(Enemy.MAX_HEALTH - 1);
      expect(enemy.active).toBe(true);
    });
  });

  describe("canShoot", () => {
    it("returns false when player is out of range", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      // Player 1000px away — beyond SHOOTING_RANGE (300)
      const farPlayer = { x: 1500, y: 100 };
      expect(enemy.canShoot(farPlayer)).toBe(false);
    });

    it("returns true when player is in range and cooldown passed", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const nearPlayer = { x: 600, y: 100 };
      // Converge aim before checking canShoot (gradual aim correction)
      for (let i = 0; i < 50; i++) {
        enemy.update(0.05, nearPlayer, mockTerrain);
      }
      now = 2000; // ensure cooldown passed
      expect(enemy.canShoot(nearPlayer)).toBe(true);
    });

    it("returns false during cooldown", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const nearPlayer = { x: 600, y: 100 };
      enemy.shoot(nearPlayer); // fires at t=1000
      now = 1500; // 500ms < 800ms FIRE_INTERVAL
      expect(enemy.canShoot(nearPlayer)).toBe(false);
    });

    it("returns true after cooldown expires", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const nearPlayer = { x: 600, y: 100 };
      // Converge aim, then shoot, then re-converge
      for (let i = 0; i < 50; i++) {
        enemy.update(0.05, nearPlayer, mockTerrain);
      }
      enemy.shoot(nearPlayer);
      now = 2000; // 1000ms > 800ms
      // Re-converge aim after recoil divergence
      for (let i = 0; i < 50; i++) {
        enemy.update(0.05, nearPlayer, mockTerrain);
      }
      now = 5000; // ensure cooldown passed after updates
      expect(enemy.canShoot(nearPlayer)).toBe(true);
    });
  });

  describe("shoot", () => {
    it("returns bullets when shooting", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const nearPlayer = { x: 600, y: 100 };
      const { bullets } = enemy.shoot(nearPlayer);
      expect(bullets.length).toBeGreaterThan(0);
    });

    it("updates lastShotTime via getNow", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const nearPlayer = { x: 600, y: 100 };
      enemy.shoot(nearPlayer);
      // Should not be able to shoot again immediately
      now = 1100; // only 100ms later, under 800ms
      expect(enemy.canShoot(nearPlayer)).toBe(false);
    });
  });

  describe("update - patrol behavior", () => {
    it("changes patrol direction when exceeding patrol range", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const farPlayer = { x: 5000, y: 100 }; // Far away, enemy patrols

      // Move the enemy well past patrol range by running many updates
      for (let i = 0; i < 100; i++) {
        enemy.update(0.05, farPlayer, mockTerrain);
      }

      // The enemy should have moved and changed direction at some point
      // Check that it didn't move too far from start
      const distanceFromStart = Math.abs(enemy.transform.position.x - 500);
      // Should be within patrol range + some tolerance
      expect(distanceFromStart).toBeLessThan(400);
    });
  });

  describe("update - chase behavior", () => {
    it("moves toward player when in detection range", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const startX = enemy.transform.position.x;
      // Player within detection range (400) and to the right
      const nearPlayer = { x: 700, y: 100 };

      enemy.update(0.1, nearPlayer, mockTerrain);

      // Enemy should move toward the player (to the right)
      expect(enemy.transform.position.x).toBeGreaterThan(startX);
    });

    it("faces toward player when chasing", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      // Player to the left
      const leftPlayer = { x: 300, y: 100 };
      enemy.update(0.1, leftPlayer, mockTerrain);
      expect(enemy.transform.facing).toBe(-1);
    });
  });

  describe("update - terrain collision", () => {
    it("snaps to terrain height when falling", () => {
      const enemy = new Enemy(500, 50, "e1", getNow); // below terrain height of 100
      enemy.velocity.y = -100; // falling
      const farPlayer = { x: 5000, y: 100 };
      enemy.update(0.016, farPlayer, mockTerrain);
      // Should snap to terrain height
      expect(enemy.transform.position.y).toBeGreaterThanOrEqual(terrainHeight);
    });

    it("clamps position within level bounds", () => {
      const enemy = new Enemy(10, 100, "e1", getNow);
      // Push enemy to the left edge
      enemy.transform.position.x = 10;
      const farPlayer = { x: 5000, y: 100 };
      enemy.update(0.1, farPlayer, mockTerrain);
      // Should be clamped to at least 50
      expect(enemy.transform.position.x).toBeGreaterThanOrEqual(50);
    });
  });

  describe("getAbsoluteBounds", () => {
    it("returns bounds centered on position", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const bounds = enemy.getAbsoluteBounds();
      expect(bounds.upperLeft.x).toBeLessThan(500);
      expect(bounds.lowerRight.x).toBeGreaterThan(500);
    });
  });

  describe("getCenterOfGravity", () => {
    it("returns center point above feet", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const cog = enemy.getCenterOfGravity();
      expect(cog.x).toBeCloseTo(500);
      expect(cog.y).toBeGreaterThan(100);
    });
  });

  describe("aim angle", () => {
    it("aims higher at an elevated target", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const levelTarget = { x: 600, y: 100 };
      // Multiple updates for gradual aim correction to converge
      for (let i = 0; i < 50; i++) {
        enemy.update(0.05, levelTarget, mockTerrain);
      }
      const levelAngle = enemy.getWeaponAbsTransform().rotation;

      const enemy2 = new Enemy(500, 100, "e2", getNow);
      const highTarget = { x: 600, y: 300 };
      for (let i = 0; i < 50; i++) {
        enemy2.update(0.05, highTarget, mockTerrain);
      }
      const highAngle = enemy2.getWeaponAbsTransform().rotation;

      expect(highAngle).toBeGreaterThan(levelAngle);
    });

    it("aims downward at a target below", () => {
      const enemy = new Enemy(500, 200, "e1", getNow);
      const lowTarget = { x: 600, y: 50 };
      for (let i = 0; i < 50; i++) {
        enemy.update(0.05, lowTarget, mockTerrain);
      }
      const angle = enemy.getWeaponAbsTransform().rotation;
      expect(angle).toBeLessThan(0);
    });

    it("clamps aim angle to ±π/3", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      // Target directly above — extreme angle
      const aboveTarget = { x: 501, y: 10000 };
      for (let i = 0; i < 100; i++) {
        enemy.update(0.05, aboveTarget, mockTerrain);
      }
      const angle = enemy.getWeaponAbsTransform().rotation;
      expect(angle).toBeLessThanOrEqual(Math.PI / 3 + 0.01);
      expect(angle).toBeGreaterThanOrEqual(-Math.PI / 3 - 0.01);
    });
  });

  describe("chase facing when close", () => {
    it("faces player even when within 50 units", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      // Player just to the left, within 50 units
      const closeLeft = { x: 470, y: 100 };
      enemy.update(0.016, closeLeft, mockTerrain);
      expect(enemy.transform.facing).toBe(-1);
    });

    it("stops horizontal movement when within 50 units", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const closeRight = { x: 520, y: 100 };
      enemy.update(0.016, closeRight, mockTerrain);
      // velocity.x should be 0 when close
      expect(enemy.velocity.x).toBe(0);
    });
  });

  describe("level width clamping", () => {
    it("clamps x position to level width", () => {
      const enemy = new Enemy(7990, 100, "e1", getNow);
      // Chase player past level bounds
      const farRight = { x: 7995, y: 100 };
      for (let i = 0; i < 20; i++) {
        enemy.update(0.1, farRight, mockTerrain);
      }
      expect(enemy.transform.position.x).toBeLessThanOrEqual(8000);
    });
  });

  describe("getHeldObject", () => {
    it("returns the enemy weapon", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const held = enemy.getHeldObject();
      expect(held).toBeDefined();
      expect(held.type).toBeDefined();
      expect(held.type.name).toBeDefined();
    });
  });

  describe("getWeaponAbsTransform", () => {
    it("returns a transform with position near the enemy", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const wt = enemy.getWeaponAbsTransform();
      // Weapon should be near the enemy's body
      expect(Math.abs(wt.position.x - 500)).toBeLessThan(100);
      expect(Math.abs(wt.position.y - 100)).toBeLessThan(100);
    });
  });

  describe("previousPosition", () => {
    it("captures position before update", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const farPlayer = { x: 5000, y: 100 };
      // Land first
      enemy.update(0.016, farPlayer, mockTerrain);
      const xBefore = enemy.transform.position.x;
      const yBefore = enemy.transform.position.y;
      enemy.update(0.1, farPlayer, mockTerrain);
      expect(enemy.previousPosition.x).toBe(xBefore);
      expect(enemy.previousPosition.y).toBe(yBefore);
    });
  });

  describe("getEntityLabel", () => {
    it("returns 'Enemy'", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      expect(enemy.getEntityLabel()).toBe("Enemy");
    });
  });

  describe("getBulletExplosionParameters", () => {
    it("returns explosion parameters with colors", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const params = enemy.getBulletExplosionParameters();
      expect(params.colors.length).toBeGreaterThan(0);
      expect(params.particleCount).toBeGreaterThan(0);
      expect(params.radius).toBeGreaterThan(0);
    });
  });

  describe("recoil and aim correction", () => {
    it("enemy gradually corrects aim instead of snapping", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      // Target far above to create a large aim angle difference
      const highTarget = { x: 600, y: 500 };
      enemy.update(0.016, highTarget, mockTerrain);
      const angleAfterOneUpdate = enemy.getWeaponAbsTransform().rotation;
      // Should have moved toward target but not reached it
      expect(angleAfterOneUpdate).toBeGreaterThan(0);
      // Compute what the instant snap would be (large angle)
      // With gradual correction at 3 rad/s and dt=0.016, max correction = 0.048
      expect(angleAfterOneUpdate).toBeLessThan(0.1);
    });

    it("enemy cannot shoot while aim is off target", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      // Place player at same height so target angle ≈ 0
      const nearPlayer = { x: 600, y: 100 };
      // Manually set aim far off target
      (enemy as any).aimAngle = 0.5; // well above accuracy threshold of 0.05
      now = 2000; // ensure cooldown has passed
      expect(enemy.canShoot(nearPlayer)).toBe(false);
    });

    it("enemy can shoot once aim is corrected", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const nearPlayer = { x: 600, y: 100 };
      // Converge aim with many updates
      for (let i = 0; i < 50; i++) {
        enemy.update(0.05, nearPlayer, mockTerrain);
      }
      now = 2000;
      expect(enemy.canShoot(nearPlayer)).toBe(true);
    });

    it("shoot applies recoil to enemy", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const nearPlayer = { x: 600, y: 100 };
      // Converge aim first
      for (let i = 0; i < 50; i++) {
        enemy.update(0.05, nearPlayer, mockTerrain);
      }
      const rotBefore = enemy.getWeaponAbsTransform().rotation;
      enemy.shoot(nearPlayer);
      const rotAfter = enemy.getWeaponAbsTransform().rotation;
      // Recoil kicks aim upward
      expect(rotAfter).toBeGreaterThan(rotBefore);
    });

    it("enemy re-aims after recoil divergence", () => {
      const enemy = new Enemy(500, 100, "e1", getNow);
      const nearPlayer = { x: 600, y: 100 };
      // Converge aim
      for (let i = 0; i < 50; i++) {
        enemy.update(0.05, nearPlayer, mockTerrain);
      }
      const rotBeforeShot = enemy.getWeaponAbsTransform().rotation;
      // Shoot to apply recoil + divergence
      enemy.shoot(nearPlayer);
      const rotAfterShot = enemy.getWeaponAbsTransform().rotation;
      // Recoil kicked aim away from converged position
      expect(rotAfterShot).not.toBeCloseTo(rotBeforeShot, 2);
      // Update many times to recover recoil and re-correct aim
      for (let i = 0; i < 100; i++) {
        enemy.update(0.05, nearPlayer, mockTerrain);
      }
      const rotAfterRecovery = enemy.getWeaponAbsTransform().rotation;
      // Difference from pre-shot rotation should be smaller after recovery
      const driftAfterShot = Math.abs(rotAfterShot - rotBeforeShot);
      const driftAfterRecovery = Math.abs(rotAfterRecovery - rotBeforeShot);
      expect(driftAfterRecovery).toBeLessThan(driftAfterShot);
    });
  });
});
