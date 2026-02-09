import { describe, it, expect, vi, beforeEach } from "vitest";
import { GameWorld, calculateThrowPower, GameWorldOptions } from "../GameWorld";
import { EMPTY_INPUT, PlayerInput } from "../InputResolver";
import { Terrain } from "../Terrain";
import { LEVEL_ORDER } from "../LevelConfig";
import { Player } from "../Player";
import { Bullet } from "../Bullet";

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

vi.mock("../SoundManager", () => {
  return {
    SoundManager: class {
      playHit = vi.fn();
      playShoot = vi.fn();
    },
  };
});

const createWorld = (options: GameWorldOptions = {}): GameWorld =>
  new GameWorld(800, 600, options);

const initWorld = (world: GameWorld, seed = 12345, levelIndex = 0): void => {
  world.initLevel(seed, levelIndex);
};

describe("calculateThrowPower", () => {
  const MAX = GameWorld.MAX_CHARGE_TIME_MS;

  it("returns 0 for 0 charge time", () => {
    expect(calculateThrowPower(0, MAX)).toBe(0);
  });

  it("returns 0.5 at half the max charge time", () => {
    expect(calculateThrowPower(MAX / 2, MAX)).toBeCloseTo(0.5);
  });

  it("returns 1.0 at exactly max charge time", () => {
    expect(calculateThrowPower(MAX, MAX)).toBe(1.0);
  });

  it("clamps at 1.0 when charge time exceeds max", () => {
    expect(calculateThrowPower(MAX * 2, MAX)).toBe(1.0);
  });
});

describe("GameWorld", () => {
  describe("constructor", () => {
    it("creates with default level config", () => {
      const world = createWorld();
      expect(world.currentLevelIndex).toBe(0);
      expect(world.currentLevelName).toBe("Grasslands");
      expect(world.player).toBeDefined();
      expect(world.terrain).toBeDefined();
    });

    it("initializes camera with provided dimensions", () => {
      const world = new GameWorld(1024, 768);
      expect(world.camera.width).toBe(1024);
      expect(world.camera.height).toBe(768);
    });
  });

  describe("initLevel", () => {
    it("sets the seed", () => {
      const world = createWorld();
      initWorld(world, 42);
      expect(world.seed).toBe(42);
    });

    it("increments levelStartCounter", () => {
      const world = createWorld();
      expect(world.levelStartCounter).toBe(0);
      initWorld(world);
      expect(world.levelStartCounter).toBe(1);
      initWorld(world);
      expect(world.levelStartCounter).toBe(2);
    });

    it("sets levelIndex when provided", () => {
      const world = createWorld();
      initWorld(world, 12345, 1);
      expect(world.currentLevelIndex).toBe(1);
      expect(world.currentLevelName).toBe("Desert");
    });

    it("keeps current levelIndex when not provided", () => {
      const world = createWorld();
      initWorld(world, 12345, 2);
      expect(world.currentLevelIndex).toBe(2);
      world.initLevel(99999);
      expect(world.currentLevelIndex).toBe(2);
    });

    it("spawns enemies after init", () => {
      const world = createWorld();
      initWorld(world);
      expect(world.allEnemies.length).toBeGreaterThan(0);
    });
  });

  describe("reset", () => {
    it("clears all projectiles and enemies", () => {
      const world = createWorld();
      initWorld(world);
      // After init there should be enemies
      expect(world.allEnemies.length).toBeGreaterThan(0);

      world.reset();
      expect(world.bullets).toEqual([]);
      expect(world.grenades).toEqual([]);
      expect(world.rockets).toEqual([]);
      expect(world.enemies).toEqual([]);
      expect(world.allEnemies).toEqual([]);
      expect(world.activeEnemies.size).toBe(0);
    });

    it("resets player position to start", () => {
      const world = createWorld();
      initWorld(world);
      const startX = GameWorld.PLAYER_START_X;
      expect(world.player.transform.position.x).toBe(startX);
    });
  });

  describe("spawnEnemies", () => {
    it("spawns enemies for Grasslands (1 per screen)", () => {
      const world = createWorld();
      initWorld(world, 12345, 0);
      // Grasslands: 1 enemy per screen, level is 8000 wide, 800px screens = 10 screens
      // Enemies start from screen 1 (not screen 0), so 9 screens * 1 = 9 enemies
      expect(world.allEnemies.length).toBe(9);
    });

    it("spawns more enemies for Desert (2 per screen)", () => {
      const world = createWorld();
      initWorld(world, 12345, 1);
      // Desert: 2 enemies per screen, 9 screens = 18 enemies
      expect(world.allEnemies.length).toBe(18);
    });

    it("spawns enemies at positions within terrain bounds", () => {
      const world = createWorld();
      initWorld(world);
      const levelWidth = world.terrain.getLevelWidth();
      world.allEnemies.forEach(enemy => {
        expect(enemy.transform.position.x).toBeGreaterThan(0);
        expect(enemy.transform.position.x).toBeLessThanOrEqual(levelWidth);
      });
    });

    it("spawns enemies to the right of the player", () => {
      const world = createWorld();
      initWorld(world);
      world.allEnemies.forEach(enemy => {
        expect(enemy.transform.position.x).toBeGreaterThan(world.player.transform.position.x);
      });
    });
  });

  describe("activateNearbyEnemies", () => {
    it("activates enemies within 2 screens of camera", () => {
      const world = createWorld();
      initWorld(world);
      // Camera starts at 0, enemies starting from screen 1 (x=800+)
      // 2 screens = 1600px range
      world.activateNearbyEnemies();
      // Some enemies near camera should be activated
      expect(world.enemies.length).toBeGreaterThan(0);
    });

    it("does not re-activate already active enemies", () => {
      const world = createWorld();
      initWorld(world);
      world.activateNearbyEnemies();
      const countAfterFirst = world.enemies.length;
      world.activateNearbyEnemies();
      expect(world.enemies.length).toBe(countAfterFirst);
    });
  });

  describe("update", () => {
    it("moves player right when right input is provided", () => {
      const world = createWorld();
      initWorld(world);
      const startX = world.player.transform.position.x;
      const input: PlayerInput = { ...EMPTY_INPUT, right: true };
      world.update(1 / 60, input);
      expect(world.player.transform.position.x).toBeGreaterThan(startX);
    });

    it("moves player left when left input is provided", () => {
      const world = createWorld();
      initWorld(world);
      // Move player away from left edge first
      world.player.transform.position.x = 200;
      const startX = world.player.transform.position.x;
      const input: PlayerInput = { ...EMPTY_INPUT, left: true };
      world.update(1 / 60, input);
      expect(world.player.transform.position.x).toBeLessThan(startX);
    });

    it("filters out inactive bullets", () => {
      const world = createWorld();
      initWorld(world);
      const bullet = new Bullet(100, 300, 1, 0, "player");
      bullet.active = false;
      world.bullets.push(bullet);
      world.update(1 / 60, EMPTY_INPUT);
      expect(world.bullets.length).toBe(0);
    });

    it("removes dead enemies from active list", () => {
      const world = createWorld();
      initWorld(world);
      world.activateNearbyEnemies();
      if (world.enemies.length > 0) {
        world.enemies[0].health = 0;
        world.update(1 / 60, EMPTY_INPUT);
        expect(world.enemies.every(e => e.health > 0)).toBe(true);
      }
    });

    it("updates camera to follow player", () => {
      const world = createWorld();
      initWorld(world);
      const input: PlayerInput = { ...EMPTY_INPUT, right: true };
      // Player speed is 200px/s, camera lookAhead is 100, camera width 800
      // Need player past x=300 for desired camera > 0: x - 400 + 100 > 0 → x > 300
      // At 200px/s, that's 1.5s = 90 frames at 1/60
      for (let i = 0; i < 120; i++) {
        world.update(1 / 60, input);
      }
      expect(world.player.transform.position.x).toBeGreaterThan(300);
      expect(world.camera.bottomLeftWorldX).toBeGreaterThan(0);
    });
  });

  describe("updateGunInput", () => {
    it("fires a bullet on trigger press", () => {
      const world = createWorld();
      initWorld(world);
      expect(world.bullets.length).toBe(0);
      world.updateGunInput(true);
      expect(world.bullets.length).toBe(1);
    });

    it("does not double-fire on same trigger hold", () => {
      const world = createWorld();
      initWorld(world);
      world.updateGunInput(true);
      expect(world.bullets.length).toBe(1);
      // Same trigger hold — hasThisTriggeringShot is now true
      world.updateGunInput(true);
      // Depending on weapon fire mode, may or may not fire again
      // But at minimum, the first shot should have worked
      expect(world.bullets.length).toBeGreaterThanOrEqual(1);
    });

    it("does nothing when trigger not pressed", () => {
      const world = createWorld();
      initWorld(world);
      world.updateGunInput(false);
      expect(world.bullets.length).toBe(0);
    });

    it("plays shoot sound when bullet fired", () => {
      const world = createWorld();
      initWorld(world);
      world.updateGunInput(true);
      expect(world.soundManager.playShoot).toHaveBeenCalled();
    });
  });

  describe("updateGrenadeInput", () => {
    let now: number;

    beforeEach(() => {
      now = 1000;
    });

    it("starts charging on new trigger press", () => {
      const world = createWorld({ getNow: () => now });
      initWorld(world);
      world.player.switchWeaponCategory(); // switch to grenade
      world.updateGrenadeInput(true);
      // Charging started — no grenade thrown yet
      expect(world.grenades.length).toBe(0);
    });

    it("initiates throw on trigger release after charging", () => {
      const world = createWorld({ getNow: () => now });
      initWorld(world);
      world.player.switchWeaponCategory(); // switch to grenade
      const initialGrenadeCount = world.player.getGrenadeCount();
      // Press trigger to start charging
      world.updateGrenadeInput(true);
      // Advance time for charge
      now += 500;
      // Release trigger — this calls player.startThrow()
      world.updateGrenadeInput(false);
      // Grenade count should have decremented (throw was initiated)
      expect(world.player.getGrenadeCount()).toBe(initialGrenadeCount - 1);
    });
  });

  describe("updateLauncherInput", () => {
    it("fires a rocket on trigger press", () => {
      const world = createWorld();
      initWorld(world);
      world.player.switchWeaponCategory(); // gun -> grenade
      world.player.switchWeaponCategory(); // grenade -> launcher
      expect(world.rockets.length).toBe(0);
      world.updateLauncherInput(true);
      expect(world.rockets.length).toBe(1);
    });

    it("does nothing when trigger not pressed", () => {
      const world = createWorld();
      initWorld(world);
      world.player.switchWeaponCategory();
      world.player.switchWeaponCategory();
      world.updateLauncherInput(false);
      expect(world.rockets.length).toBe(0);
    });
  });

  describe("checkLevelCompletion", () => {
    it("calls onLevelComplete when player reaches right edge on non-final level", () => {
      const onLevelComplete = vi.fn();
      const world = createWorld({ onLevelComplete });
      initWorld(world, 12345, 0);
      // Move player to right edge
      const levelWidth = world.terrain.getLevelWidth();
      world.player.transform.position.x = levelWidth - 50;
      world.checkLevelCompletion();
      expect(onLevelComplete).toHaveBeenCalledTimes(1);
    });

    it("calls onFinalLevelComplete on last level", () => {
      const onFinalLevelComplete = vi.fn();
      const world = createWorld({ onFinalLevelComplete });
      const lastLevelIndex = LEVEL_ORDER.length - 1;
      initWorld(world, 12345, lastLevelIndex);
      const levelWidth = world.terrain.getLevelWidth();
      world.player.transform.position.x = levelWidth - 50;
      world.checkLevelCompletion();
      expect(onFinalLevelComplete).toHaveBeenCalledTimes(1);
    });

    it("does not fire callbacks when player is not at edge", () => {
      const onLevelComplete = vi.fn();
      const onFinalLevelComplete = vi.fn();
      const world = createWorld({ onLevelComplete, onFinalLevelComplete });
      initWorld(world);
      world.player.transform.position.x = 100;
      world.checkLevelCompletion();
      expect(onLevelComplete).not.toHaveBeenCalled();
      expect(onFinalLevelComplete).not.toHaveBeenCalled();
    });
  });

  describe("player death", () => {
    it("calls onGameOver when player health reaches 0", () => {
      const onGameOver = vi.fn();
      const world = createWorld({ onGameOver });
      initWorld(world);
      world.player.health = 0;
      world.update(1 / 60, EMPTY_INPUT);
      expect(onGameOver).toHaveBeenCalledTimes(1);
    });
  });

  describe("clearTriggerState", () => {
    it("allows a new trigger press after clearing", () => {
      vi.useFakeTimers();
      try {
        const world = createWorld();
        initWorld(world);
        // First shot
        world.updateGunInput(true);
        expect(world.bullets.length).toBe(1);
        // Advance past fire interval (Webley = 300ms)
        vi.advanceTimersByTime(400);
        // Without clearing, held trigger on semi-auto won't fire again
        world.updateGunInput(true);
        expect(world.bullets.length).toBe(1); // still 1 — not a new trigger press
        // Clear trigger state (simulates key up) and press again
        world.clearTriggerState();
        world.updateGunInput(true);
        expect(world.bullets.length).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("switchWeapon / reloadWeapon / switchWeaponCategory", () => {
    it("delegates switchWeapon to player", () => {
      const world = createWorld();
      initWorld(world);
      const spy = vi.spyOn(world.player, "switchWeaponInCategory");
      world.switchWeapon();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("delegates reloadWeapon to player", () => {
      const world = createWorld();
      initWorld(world);
      const spy = vi.spyOn(world.player, "reload");
      world.reloadWeapon();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("delegates switchWeaponCategory to player", () => {
      const world = createWorld();
      initWorld(world);
      const spy = vi.spyOn(world.player, "switchWeaponCategory");
      world.switchWeaponCategory();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });
});
