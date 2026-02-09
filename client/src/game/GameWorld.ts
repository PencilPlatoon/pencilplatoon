import { Player } from "./entities/Player";
import { Enemy } from "./entities/Enemy";
import { Terrain } from "./world/Terrain";
import { ParticleSystem } from "./systems/ParticleSystem";
import { Camera } from "./systems/Camera";
import { CollisionSystem } from "./systems/CollisionSystem";
import { Bullet } from "./entities/Bullet";
import { Grenade } from "./entities/Grenade";
import { Rocket } from "./entities/Rocket";
import { SoundManager } from "./systems/SoundManager";
import { LEVEL_DEFINITIONS, LEVEL_ORDER, LevelConfig } from "./world/LevelConfig";
import { setGlobalSeed, seededRandom } from "../util/random";
import { PlayerInput } from "./InputResolver";

export const calculateThrowPower = (chargeTime: number, maxChargeTimeMs: number): number =>
  Math.min(1.0, chargeTime / maxChargeTimeMs);

export interface GameWorldOptions {
  getNow?: () => number;
  onLevelComplete?: () => void;
  onGameOver?: () => void;
  onFinalLevelComplete?: () => void;
}

export class GameWorld {
  static readonly SCREEN_WIDTH = 800;
  static readonly PLAYER_START_X = 50;
  static readonly MAX_CHARGE_TIME_MS = 1000;

  player: Player;
  enemies: Enemy[] = [];
  allEnemies: Enemy[] = [];
  activeEnemies: Set<string> = new Set();
  bullets: Bullet[] = [];
  grenades: Grenade[] = [];
  rockets: Rocket[] = [];
  terrain: Terrain;
  particleSystem: ParticleSystem;
  camera: Camera;
  soundManager: SoundManager;
  collisionSystem: CollisionSystem;

  currentLevelIndex = 0;
  debugMode = false;
  seed: number = 12345;
  levelStartCounter = 0;

  private hasThisTriggeringShot = false;
  private isChargingThrow = false;
  private throwChargeStartTime = 0;

  private readonly getNow: () => number;
  private readonly onLevelComplete: () => void;
  private readonly onGameOver: () => void;
  private readonly onFinalLevelComplete: () => void;

  get currentLevelName(): string {
    return LEVEL_ORDER[this.currentLevelIndex];
  }

  get currentLevelConfig(): LevelConfig {
    return LEVEL_DEFINITIONS[this.currentLevelName];
  }

  constructor(
    cameraWidth: number,
    cameraHeight: number,
    options: GameWorldOptions = {},
  ) {
    this.getNow = options.getNow ?? Date.now;
    this.onLevelComplete = options.onLevelComplete ?? (() => {});
    this.onGameOver = options.onGameOver ?? (() => {});
    this.onFinalLevelComplete = options.onFinalLevelComplete ?? (() => {});

    this.camera = new Camera(cameraWidth, cameraHeight);
    this.terrain = new Terrain(this.currentLevelConfig.terrainColor);
    this.particleSystem = new ParticleSystem();
    this.soundManager = new SoundManager();
    this.collisionSystem = new CollisionSystem();
    this.player = new Player(GameWorld.PLAYER_START_X, Terrain.WORLD_TOP);
  }

  initLevel(seed: number, levelIndex?: number) {
    this.seed = seed;
    setGlobalSeed(this.seed);
    this.levelStartCounter++;
    if (levelIndex !== undefined) {
      this.initLevelTerrain(levelIndex);
    }
    this.reset();
    this.spawnEnemies();
  }

  private initLevelTerrain(levelIndex: number) {
    this.currentLevelIndex = levelIndex;
    const levelName = this.currentLevelName;
    const config = this.currentLevelConfig;
    this.terrain = new Terrain(config.terrainColor);
    this.terrain.generateTerrain(config.terrain);

    this.camera.setTerrain(this.terrain);

    console.log(`[initLevelTerrain] Player y set to ${this.player.transform.position.y} at x=${GameWorld.PLAYER_START_X}, terrain height: ${this.terrain.getHeightAt(GameWorld.PLAYER_START_X)}`);
    console.log(`Level ${levelName} initialized`);
  }

  reset() {
    this.bullets = [];
    this.grenades = [];
    this.rockets = [];
    this.enemies = [];
    this.allEnemies = [];
    this.activeEnemies.clear();
    this.particleSystem.clear();

    this.camera.reset();

    this.player.reset(GameWorld.PLAYER_START_X, this.terrain.getHeightAt(GameWorld.PLAYER_START_X) + 1);

    this.hasThisTriggeringShot = false;
    this.isChargingThrow = false;
    this.throwChargeStartTime = 0;
  }

  spawnEnemies() {
    this.allEnemies = [];
    const levelWidth = this.terrain.getLevelWidth();
    const screenWidth = GameWorld.SCREEN_WIDTH;
    const numScreens = Math.ceil(levelWidth / screenWidth);
    const enemiesPerScreen = this.currentLevelConfig.enemiesPerScreen;
    console.log(`[spawnEnemies] levelWidth=${levelWidth}, numScreens=${numScreens}, enemiesPerScreen=${enemiesPerScreen}`);
    for (let screen = 1; screen < numScreens; screen++) {
      for (let i = 0; i < enemiesPerScreen; i++) {
        let x = Math.min(screen * screenWidth + 200 + (i * 200) + seededRandom(0, 100), levelWidth);
        if (x <= this.player.transform.position.x) {
          x = this.player.transform.position.x + 100;
        }
        const y = this.terrain.getHeightAt(x) + 1;
        const enemy = new Enemy(x, y, `enemy_gen${this.levelStartCounter}_sc${screen}_num${i}`);
        this.allEnemies.push(enemy);
        console.log(`[spawnEnemies] Spawned enemy id=${enemy.id} at x=${x}, y=${y}`);
      }
    }
    console.log(`[spawnEnemies] Total spawned: ${this.allEnemies.length}`);
  }

  update(deltaTime: number, input: PlayerInput) {
    this.updatePlayer(deltaTime, input);
    this.activateNearbyEnemies();

    this.enemies.forEach(enemy => {
      const playerCOG = this.player.getCenterOfGravity();
      enemy.update(deltaTime, playerCOG, this.terrain);

      if (enemy.canShoot(playerCOG)) {
        const bullet = enemy.shoot(playerCOG);
        if (bullet) {
          this.bullets.push(bullet);
        }
      }
    });

    this.bullets = this.bullets.filter(bullet => {
      bullet.update(deltaTime);
      return bullet.active;
    });

    this.grenades.forEach(grenade => {
      grenade.update(deltaTime, this.terrain);
    });

    this.rockets.forEach(rocket => {
      rocket.update(deltaTime, this.terrain);
    });

    this.collisionSystem.handleCollisions({
      bullets: this.bullets,
      enemies: this.enemies,
      grenades: this.grenades,
      rockets: this.rockets,
      player: this.player,
      terrain: this.terrain,
      particleSystem: this.particleSystem,
      soundManager: this.soundManager,
    });

    this.grenades = this.grenades.filter(grenade => grenade.active);
    this.rockets = this.rockets.filter(rocket => rocket.active);

    this.particleSystem.update(deltaTime);

    this.camera.followTarget(this.player.transform.position, deltaTime);

    this.enemies = this.enemies.filter(enemy => enemy.health > 0);

    this.checkLevelCompletion();
  }

  activateNearbyEnemies() {
    const screenWidth = GameWorld.SCREEN_WIDTH;
    const cameraX = this.camera.bottomLeftWorldX;
    this.allEnemies.forEach(enemy => {
      const distanceFromCamera = Math.abs(enemy.transform.position.x - cameraX);
      if (distanceFromCamera <= screenWidth * 2 && !this.activeEnemies.has(enemy.id)) {
        this.activeEnemies.add(enemy.id);
        this.enemies.push(enemy);
        console.log(`[activateNearbyEnemies] Activated enemy id=${enemy.id} at x=${enemy.transform.position.x}, distanceFromCamera=${distanceFromCamera}`);
      }
    });
  }

  checkLevelCompletion() {
    const levelWidth = this.terrain.getLevelWidth();
    if (this.player.transform.position.x >= levelWidth - 100) {
      if (this.currentLevelIndex < LEVEL_ORDER.length - 1) {
        this.onLevelComplete();
      } else {
        this.onFinalLevelComplete();
      }
    }
  }

  private updatePlayer(deltaTime: number, input: PlayerInput) {
    this.player.update(deltaTime, input, this.terrain);

    const category = this.player.getSelectedWeaponCategory();
    if (category === "gun") {
      this.updateGunInput(input.triggerPressed);
    } else if (category === "grenade") {
      this.updateGrenadeInput(input.triggerPressed);
    } else {
      this.updateLauncherInput(input.triggerPressed);
    }

    if (this.player.health <= 0) {
      this.onGameOver();
    }
  }

  updateGunInput(triggerPressed: boolean) {
    if (!triggerPressed) return;
    const newTriggerPress = !this.hasThisTriggeringShot;
    if (this.player.canShoot(newTriggerPress)) {
      const bullet = this.player.shoot(newTriggerPress);
      if (bullet) {
        this.bullets.push(bullet);
        this.soundManager.playShoot();
        this.hasThisTriggeringShot = true;
      }
    }
  }

  updateGrenadeInput(triggerPressed: boolean) {
    if (triggerPressed) {
      const newTriggerPress = !this.hasThisTriggeringShot;
      if (newTriggerPress && this.player.canStartThrow()) {
        this.isChargingThrow = true;
        this.throwChargeStartTime = this.getNow();
        this.hasThisTriggeringShot = true;
      }
      if (this.isChargingThrow) {
        const chargeTime = this.getNow() - this.throwChargeStartTime;
        this.player.setThrowPower(calculateThrowPower(chargeTime, GameWorld.MAX_CHARGE_TIME_MS));
      }
    } else if (this.isChargingThrow) {
      const chargeTime = this.getNow() - this.throwChargeStartTime;
      this.player.setThrowPower(calculateThrowPower(chargeTime, GameWorld.MAX_CHARGE_TIME_MS));
      this.player.startThrow();
      this.isChargingThrow = false;
    }

    const completedGrenade = this.player.getCompletedGrenadeThrow();
    if (completedGrenade) {
      this.grenades.push(completedGrenade);
    }
  }

  updateLauncherInput(triggerPressed: boolean) {
    if (!triggerPressed) return;
    const newTriggerPress = !this.hasThisTriggeringShot;
    const rocket = this.player.launch(newTriggerPress);
    if (rocket) {
      this.rockets.push(rocket);
      this.soundManager.playShoot();
      this.hasThisTriggeringShot = true;
    }
  }

  clearTriggerState() {
    this.hasThisTriggeringShot = false;
  }

  switchWeapon() {
    this.player.switchWeaponInCategory();
  }

  reloadWeapon() {
    this.player.reload();
  }

  switchWeaponCategory() {
    this.player.switchWeaponCategory();
  }
}
