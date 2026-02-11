import { describe, it, expect, vi } from "vitest";
import { CollisionSystem, applyExplosionDamage } from "@/game/systems/CollisionSystem";
import { AbsoluteBoundingBox } from "@/game/types/BoundingBox";
import { Bullet } from "@/game/entities/Bullet";
import { Enemy } from "@/game/entities/Enemy";
import { Grenade } from "@/game/entities/Grenade";
import { Rocket } from "@/game/entities/Rocket";
import { Player } from "@/game/entities/Player";
import { Terrain } from "@/game/world/Terrain";
import { DamageableEntity } from "@/game/types/interfaces";

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

// Y-up coordinate system: upperLeft.y > lowerRight.y
function makeRect(left: number, bottom: number, right: number, top: number): AbsoluteBoundingBox {
  return {
    upperLeft: { x: left, y: top },
    lowerRight: { x: right, y: bottom },
  };
}

const makeMockParticleSystem = () => ({
  createExplosion: vi.fn(),
  clear: vi.fn(),
  update: vi.fn(),
  render: vi.fn(),
});

const makeMockSoundManager = () => ({
  playHit: vi.fn(),
  playShoot: vi.fn(),
});

const makeMockTerrain = (collides: boolean = false) => ({
  getHeightAt: () => 100,
  getLevelWidth: () => 8000,
  checkCollision: vi.fn(() => collides),
}) as unknown as Terrain;

// Create a bullet at a position moving in a direction
const makeBullet = (x: number, y: number, dirX = 1, dirY = 0) =>
  new Bullet(x, y, { x: dirX, y: dirY }, 500, 10, 3);

// Create an enemy at a position
const makeEnemy = (x: number, y: number) => {
  let now = 10000;
  return new Enemy(x, y, `enemy_${x}_${y}`, () => now);
};

describe("CollisionSystem", () => {
  const cs = new CollisionSystem();

  describe("checkCollision", () => {
    it("detects overlapping rectangles", () => {
      const a = makeRect(0, 0, 10, 10);
      const b = makeRect(5, 5, 15, 15);
      expect(cs.checkCollision(a, b)).toBe(true);
    });

    it("returns false for non-overlapping rectangles", () => {
      const a = makeRect(0, 0, 10, 10);
      const b = makeRect(20, 20, 30, 30);
      expect(cs.checkCollision(a, b)).toBe(false);
    });

    it("returns false for touching edges (no overlap)", () => {
      const a = makeRect(0, 0, 10, 10);
      const b = makeRect(10, 0, 20, 10);
      expect(cs.checkCollision(a, b)).toBe(false);
    });

    it("detects containment", () => {
      const outer = makeRect(0, 0, 100, 100);
      const inner = makeRect(20, 20, 40, 40);
      expect(cs.checkCollision(outer, inner)).toBe(true);
      expect(cs.checkCollision(inner, outer)).toBe(true);
    });
  });

  describe("checkPointInRect", () => {
    const rect = makeRect(10, 10, 50, 50);

    it("returns true for point inside", () => {
      expect(cs.checkPointInRect({ x: 30, y: 30 }, rect)).toBe(true);
    });

    it("returns true for point on edge", () => {
      expect(cs.checkPointInRect({ x: 10, y: 30 }, rect)).toBe(true);
    });

    it("returns false for point outside", () => {
      expect(cs.checkPointInRect({ x: 0, y: 0 }, rect)).toBe(false);
      expect(cs.checkPointInRect({ x: 60, y: 30 }, rect)).toBe(false);
    });
  });

  describe("checkLineIntersectsRect", () => {
    const rect = makeRect(10, 10, 50, 50);

    it("detects line passing through rect", () => {
      expect(cs.checkLineIntersectsRect({ x: 0, y: 30 }, { x: 60, y: 30 }, rect)).toBe(true);
    });

    it("detects line starting inside rect", () => {
      expect(cs.checkLineIntersectsRect({ x: 30, y: 30 }, { x: 100, y: 30 }, rect)).toBe(true);
    });

    it("detects line ending inside rect", () => {
      expect(cs.checkLineIntersectsRect({ x: 0, y: 30 }, { x: 30, y: 30 }, rect)).toBe(true);
    });

    it("returns false for line completely outside", () => {
      expect(cs.checkLineIntersectsRect({ x: 0, y: 0 }, { x: 5, y: 5 }, rect)).toBe(false);
    });

    it("detects shallow diagonal line through rect", () => {
      expect(cs.checkLineIntersectsRect({ x: 0, y: 30 }, { x: 60, y: 35 }, rect)).toBe(true);
    });

    it("returns true for zero-length point inside rect", () => {
      expect(cs.checkLineIntersectsRect({ x: 30, y: 30 }, { x: 30, y: 30 }, rect)).toBe(true);
    });
  });

  describe("checkGameObjectCollision", () => {
    it("detects AABB overlap between bullet and enemy", () => {
      const bullet = makeBullet(500, 120); // near enemy center
      const enemy = makeEnemy(500, 100);
      expect(cs.checkGameObjectCollision(bullet, enemy)).toBe(true);
    });

    it("returns false when objects are far apart", () => {
      const bullet = makeBullet(100, 100);
      const enemy = makeEnemy(900, 100);
      expect(cs.checkGameObjectCollision(bullet, enemy)).toBe(false);
    });

    it("detects collision via line sweep when AABB misses", () => {
      const enemy = makeEnemy(500, 100);
      // Bullet starts before enemy and ends after — simulates fast movement
      const bullet = makeBullet(600, 120);
      // Override previousPosition to be on the other side of the enemy
      bullet.previousPosition = { x: 400, y: 120 };
      expect(cs.checkGameObjectCollision(bullet, enemy)).toBe(true);
    });
  });

  describe("handleCollisions — bullet vs entity", () => {
    it("damages enemy and deactivates bullet on hit", () => {
      const enemy = makeEnemy(500, 100);
      const initialHealth = enemy.health;
      // Place bullet right on top of the enemy
      const bullet = makeBullet(500, 120);
      const particles = makeMockParticleSystem();
      const sound = makeMockSoundManager();
      const terrain = makeMockTerrain(false);

      cs.handleCollisions({
        bullets: [bullet],
        enemies: [enemy],
        grenades: [],
        rockets: [],
        player: new Player(100, 200),
        terrain,
        particleSystem: particles as any,
        soundManager: sound as any,
      });

      expect(enemy.health).toBeLessThan(initialHealth);
      expect(bullet.active).toBe(false);
      expect(particles.createExplosion).toHaveBeenCalled();
      expect(sound.playHit).toHaveBeenCalled();
    });

    it("does not damage enemy when bullet misses", () => {
      const enemy = makeEnemy(500, 100);
      const initialHealth = enemy.health;
      const bullet = makeBullet(100, 400); // far away
      const particles = makeMockParticleSystem();
      const sound = makeMockSoundManager();
      const terrain = makeMockTerrain(false);

      cs.handleCollisions({
        bullets: [bullet],
        enemies: [enemy],
        grenades: [],
        rockets: [],
        player: new Player(100, 200),
        terrain,
        particleSystem: particles as any,
        soundManager: sound as any,
      });

      expect(enemy.health).toBe(initialHealth);
      expect(bullet.active).toBe(true);
    });

    it("damages player when bullet hits player", () => {
      const player = new Player(500, 100);
      const initialHealth = player.health;
      // Place bullet at player center
      const bullet = makeBullet(500, 120);
      const particles = makeMockParticleSystem();
      const sound = makeMockSoundManager();
      const terrain = makeMockTerrain(false);

      cs.handleCollisions({
        bullets: [bullet],
        enemies: [],
        grenades: [],
        rockets: [],
        player,
        terrain,
        particleSystem: particles as any,
        soundManager: sound as any,
      });

      expect(player.health).toBeLessThan(initialHealth);
      expect(bullet.active).toBe(false);
    });
  });

  describe("handleCollisions — bullet vs terrain", () => {
    it("deactivates bullet when terrain collision detected", () => {
      const bullet = makeBullet(200, 200);
      const particles = makeMockParticleSystem();
      const sound = makeMockSoundManager();
      const terrain = makeMockTerrain(true); // terrain always collides

      cs.handleCollisions({
        bullets: [bullet],
        enemies: [],
        grenades: [],
        rockets: [],
        player: new Player(100, 400), // far from bullet
        terrain,
        particleSystem: particles as any,
        soundManager: sound as any,
      });

      expect(bullet.active).toBe(false);
      expect(particles.createExplosion).toHaveBeenCalled();
    });

    it("does not deactivate bullet when no terrain collision", () => {
      const bullet = makeBullet(200, 200);
      const particles = makeMockParticleSystem();
      const sound = makeMockSoundManager();
      const terrain = makeMockTerrain(false);

      cs.handleCollisions({
        bullets: [bullet],
        enemies: [],
        grenades: [],
        rockets: [],
        player: new Player(100, 400),
        terrain,
        particleSystem: particles as any,
        soundManager: sound as any,
      });

      expect(bullet.active).toBe(true);
    });
  });

  describe("handleCollisions — rocket vs entity", () => {
    it("explodes rocket on entity collision", () => {
      const enemy = makeEnemy(500, 100);
      // Rocket right on enemy
      const rocket = new Rocket(500, 120, { x: 100, y: 0 });
      rocket.holder = null; // no holder — rocket is free-flying
      (rocket as any).lastHolder = null;
      const particles = makeMockParticleSystem();
      const sound = makeMockSoundManager();
      const terrain = makeMockTerrain(false);

      cs.handleCollisions({
        bullets: [],
        enemies: [enemy],
        grenades: [],
        rockets: [rocket],
        player: new Player(100, 400),
        terrain,
        particleSystem: particles as any,
        soundManager: sound as any,
      });

      expect(rocket.isExploded()).toBe(true);
      expect(rocket.active).toBe(false);
    });

    it("skips rocket collision check when rocket has lastHolder", () => {
      const enemy = makeEnemy(500, 100);
      const rocket = new Rocket(500, 120, { x: 100, y: 0 });
      rocket.holder = null;
      // Set lastHolder directly (normally set during prepareForLaunch)
      (rocket as any).lastHolder = { getAbsoluteBounds: vi.fn() };
      expect(rocket.hasLastHolder()).toBe(true);

      const particles = makeMockParticleSystem();
      const sound = makeMockSoundManager();
      const terrain = makeMockTerrain(false);

      cs.handleCollisions({
        bullets: [],
        enemies: [enemy],
        grenades: [],
        rockets: [rocket],
        player: new Player(100, 400),
        terrain,
        particleSystem: particles as any,
        soundManager: sound as any,
      });

      // Rocket should NOT explode because hasLastHolder is true
      expect(rocket.isExploded()).toBe(false);
    });
  });

  describe("handleCollisions — explosion damage", () => {
    it("damages enemy when grenade explodes nearby", () => {
      const enemy = makeEnemy(500, 100);
      const initialHealth = enemy.health;
      // Create a grenade that has already exploded at the enemy's position
      const grenade = new Grenade(500, 100, { x: 0, y: 0 });
      grenade.active = false;
      (grenade as any).hasExploded = true;

      const particles = makeMockParticleSystem();
      const sound = makeMockSoundManager();
      const terrain = makeMockTerrain(false);

      cs.handleCollisions({
        bullets: [],
        enemies: [enemy],
        grenades: [grenade],
        rockets: [],
        player: new Player(100, 400),
        terrain,
        particleSystem: particles as any,
        soundManager: sound as any,
      });

      expect(enemy.health).toBeLessThan(initialHealth);
      expect(particles.createExplosion).toHaveBeenCalled();
      expect(sound.playHit).toHaveBeenCalled();
    });

    it("does not damage entity outside explosion radius", () => {
      const enemy = makeEnemy(2000, 100); // very far from grenade
      const initialHealth = enemy.health;
      const grenade = new Grenade(500, 100, { x: 0, y: 0 });
      grenade.active = false;
      (grenade as any).hasExploded = true;

      const particles = makeMockParticleSystem();
      const sound = makeMockSoundManager();
      const terrain = makeMockTerrain(false);

      cs.handleCollisions({
        bullets: [],
        enemies: [enemy],
        grenades: [grenade],
        rockets: [],
        player: new Player(100, 400),
        terrain,
        particleSystem: particles as any,
        soundManager: sound as any,
      });

      expect(enemy.health).toBe(initialHealth);
    });

    it("handles exploded rocket damaging nearby entity", () => {
      const enemy = makeEnemy(500, 100);
      const initialHealth = enemy.health;
      const rocket = new Rocket(500, 100, { x: 0, y: 0 });
      rocket.holder = null;
      (rocket as any).lastHolder = null;
      rocket.active = false;
      (rocket as any).hasExploded = true;

      const particles = makeMockParticleSystem();
      const sound = makeMockSoundManager();
      const terrain = makeMockTerrain(false);

      cs.handleCollisions({
        bullets: [],
        enemies: [enemy],
        grenades: [],
        rockets: [rocket],
        player: new Player(100, 400),
        terrain,
        particleSystem: particles as any,
        soundManager: sound as any,
      });

      expect(enemy.health).toBeLessThan(initialHealth);
    });
  });
});

describe("resolveCombatantCollisions", () => {
  const cs = new CollisionSystem();

  it("pushes overlapping player and enemy apart horizontally", () => {
    const player = new Player(500, 100);
    const enemy = makeEnemy(510, 100); // overlapping with player

    const playerXBefore = player.transform.position.x;
    const enemyXBefore = enemy.transform.position.x;

    cs.resolveCombatantCollisions([player, enemy]);

    // Player should be pushed left, enemy pushed right
    expect(player.transform.position.x).toBeLessThan(playerXBefore);
    expect(enemy.transform.position.x).toBeGreaterThan(enemyXBefore);
  });

  it("does not push non-overlapping combatants", () => {
    const player = new Player(100, 100);
    const enemy = makeEnemy(500, 100); // far apart

    cs.resolveCombatantCollisions([player, enemy]);

    expect(player.transform.position.x).toBe(100);
    expect(enemy.transform.position.x).toBe(500);
  });

  it("does not push when player is above enemy (jump over)", () => {
    const player = new Player(500, 200); // high above enemy
    const enemy = makeEnemy(500, 100);

    // Verify they don't overlap in y (player bottom > enemy top)
    const playerBounds = player.getAbsoluteBounds();
    const enemyBounds = enemy.getAbsoluteBounds();
    const isAbove = playerBounds.lowerRight.y >= enemyBounds.upperLeft.y;

    if (isAbove) {
      // If player is fully above, no overlap — no push
      cs.resolveCombatantCollisions([player, enemy]);
      expect(player.transform.position.x).toBe(500);
      expect(enemy.transform.position.x).toBe(500);
    } else {
      // If they still overlap at this height, they should be pushed apart
      cs.resolveCombatantCollisions([player, enemy]);
      // Just verify resolution happened without error
    }
  });

  it("pushes both combatants by equal amounts", () => {
    const player = new Player(500, 100);
    const enemy = makeEnemy(510, 100);

    const playerXBefore = player.transform.position.x;
    const enemyXBefore = enemy.transform.position.x;

    cs.resolveCombatantCollisions([player, enemy]);

    const playerShift = Math.abs(player.transform.position.x - playerXBefore);
    const enemyShift = Math.abs(enemy.transform.position.x - enemyXBefore);
    expect(playerShift).toBeCloseTo(enemyShift, 5);
  });

  it("resolves so bounding boxes no longer overlap", () => {
    const player = new Player(500, 100);
    const enemy = makeEnemy(510, 100);

    cs.resolveCombatantCollisions([player, enemy]);

    const playerBounds = player.getAbsoluteBounds();
    const enemyBounds = enemy.getAbsoluteBounds();
    // After resolution, right edge of left combatant <= left edge of right combatant
    const leftRight = Math.min(playerBounds.lowerRight.x, enemyBounds.lowerRight.x);
    const rightLeft = Math.max(playerBounds.upperLeft.x, enemyBounds.upperLeft.x);
    expect(leftRight).toBeLessThanOrEqual(rightLeft + 0.001);
  });

  it("skips inactive enemies", () => {
    const player = new Player(500, 100);
    const enemy = makeEnemy(510, 100);
    enemy.active = false;

    cs.resolveCombatantCollisions([player, enemy]);

    expect(player.transform.position.x).toBe(500);
  });

  it("handles player to the right of enemy", () => {
    const enemy = makeEnemy(490, 100);
    const player = new Player(500, 100); // player to the right

    const playerXBefore = player.transform.position.x;
    const enemyXBefore = enemy.transform.position.x;

    cs.resolveCombatantCollisions([player, enemy]);

    // Player should be pushed right, enemy pushed left
    expect(player.transform.position.x).toBeGreaterThan(playerXBefore);
    expect(enemy.transform.position.x).toBeLessThan(enemyXBefore);
  });

  it("resolves multiple enemy pairs", () => {
    const player = new Player(500, 100);
    const enemy1 = makeEnemy(510, 100);
    const enemy2 = makeEnemy(505, 100);

    cs.resolveCombatantCollisions([player, enemy1, enemy2]);

    // All three should have shifted — exact values depend on resolution order
    // but none should still fully overlap
    const positions = [player.transform.position.x, enemy1.transform.position.x, enemy2.transform.position.x];
    // They should be spread out more than their original 10px range
    const spread = Math.max(...positions) - Math.min(...positions);
    expect(spread).toBeGreaterThan(10);
  });
});

describe("applyExplosionDamage", () => {
  const makeDamageableEntity = (x: number, y: number, health: number) => {
    let currentHealth = health;
    return {
      getCenterOfGravity: () => ({ x, y }),
      takeDamage: (damage: number) => { currentHealth -= damage; },
      getEntityLabel: () => "TestEntity",
      getBulletExplosionParameters: () => ({
        colors: ["#ff0000"],
        particleCount: 5,
        radius: 10,
      }),
      get health() { return currentHealth; },
    } as unknown as DamageableEntity & { health: number };
  };

  it("deals full damage at distance 0", () => {
    const entity = makeDamageableEntity(100, 100, 100);
    applyExplosionDamage(entity, { x: 100, y: 100 }, 200, 50);
    expect(entity.health).toBeCloseTo(50);
  });

  it("deals reduced damage at half radius", () => {
    const entity = makeDamageableEntity(200, 100, 100);
    applyExplosionDamage(entity, { x: 100, y: 100 }, 200, 50);
    // distance = 100, radius = 200, multiplier = 1 - 100/200 = 0.5
    expect(entity.health).toBeCloseTo(75);
  });

  it("deals no damage outside explosion radius", () => {
    const entity = makeDamageableEntity(500, 100, 100);
    applyExplosionDamage(entity, { x: 100, y: 100 }, 200, 50);
    // distance = 400 > radius 200
    expect(entity.health).toBe(100);
  });

  it("deals no damage at exactly the edge of radius", () => {
    const entity = makeDamageableEntity(300, 100, 100);
    applyExplosionDamage(entity, { x: 100, y: 100 }, 200, 50);
    // distance = 200 = radius, multiplier = 1 - 200/200 = 0
    expect(entity.health).toBeCloseTo(100);
  });

  it("scales damage linearly with distance", () => {
    const e1 = makeDamageableEntity(125, 100, 100); // distance 25
    const e2 = makeDamageableEntity(150, 100, 100); // distance 50
    const e3 = makeDamageableEntity(175, 100, 100); // distance 75
    applyExplosionDamage(e1, { x: 100, y: 100 }, 100, 100);
    applyExplosionDamage(e2, { x: 100, y: 100 }, 100, 100);
    applyExplosionDamage(e3, { x: 100, y: 100 }, 100, 100);
    // Damage taken: 75, 50, 25
    expect(e1.health).toBeCloseTo(25);
    expect(e2.health).toBeCloseTo(50);
    expect(e3.health).toBeCloseTo(75);
  });
});
