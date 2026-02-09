import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { Terrain } from "./Terrain";
import { ParticleSystem } from "./ParticleSystem";
import { Camera } from "./Camera";
import { CollisionSystem } from "./CollisionSystem";
import { Bullet } from "./Bullet";
import { Grenade } from "./Grenade";
import { Rocket } from "./Rocket";
import { useGameStore } from "../lib/stores/useGameStore";
import { SoundManager } from "./SoundManager";
import { LEVEL_DEFINITIONS, LEVEL_ORDER, LevelConfig } from "./LevelConfig";
import { setGlobalSeed, seededRandom } from "../lib/utils";

export class GameEngine {
  static readonly SCREEN_WIDTH = 800;
  static readonly PLAYER_START_X = 50;
  static readonly MAX_CHARGE_TIME_MS = 1000;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private player: Player;
  private enemies: Enemy[] = [];
  private allEnemies: Enemy[] = [];
  private activeEnemies: Set<string> = new Set();
  private bullets: Bullet[] = [];
  private grenades: Grenade[] = [];
  private rockets: Rocket[] = [];
  private terrain: Terrain;
  private particleSystem: ParticleSystem;
  private camera: Camera;
  private soundManager: SoundManager;
  private collisionSystem: CollisionSystem;
  private isRunning = false;
  private lastTime = 0;
  private lastLogTime = 0;
  private keys: Set<string> = new Set();
  private mobileInput: {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    jump: boolean;
    triggerPressed: boolean;
    aimUp: boolean;
    aimDown: boolean;
  } = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    triggerPressed: false,
    aimUp: false,
    aimDown: false
  };
  private hasThisTriggeringShot = false;
  private currentLevelIndex = 0;
  private isChargingThrow = false;
  private throwChargeStartTime = 0;
  private get currentLevelName() {
    return LEVEL_ORDER[this.currentLevelIndex];
  }
  private get currentLevelConfig(): LevelConfig {
    return LEVEL_DEFINITIONS[this.currentLevelName];
  }

  private calculateThrowPower(chargeTime: number): number {
    return Math.min(1.0, chargeTime / GameEngine.MAX_CHARGE_TIME_MS);
  }
  private debugMode = false;
  private paused = false;
  private seed: number = 12345;
  private levelStartCounter = 0;

  constructor(canvas: HTMLCanvasElement) {
    console.log("GameEngine constructor");
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.camera = new Camera(canvas.width, canvas.height);
    this.terrain = new Terrain(this.currentLevelConfig.terrainColor);
    this.particleSystem = new ParticleSystem();
    this.soundManager = new SoundManager();
    this.collisionSystem = new CollisionSystem();
    this.player = new Player(GameEngine.PLAYER_START_X, Terrain.WORLD_TOP);
    
    this.setupEventListeners();

    console.log("Game engine initialized");
  }

  async start() {
    await this.player.waitForLoaded();
    await Promise.all(this.allEnemies.map(e => e.waitForLoaded()));
    console.log("Game engine: everything loaded");
    this.isRunning = true;
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
    console.log("Game started");
  }

  startGame(seed: number) {
    this.initLevel(seed, this.currentLevelIndex);
  }

  restartGame(seed: number) {
    this.initLevel(seed, 0);
  }

  restartLevel(seed: number) {
    this.initLevel(seed);
  }

  nextLevel(seed: number) {
    if (this.currentLevelIndex < LEVEL_ORDER.length - 1) {
      this.initLevel(seed, this.currentLevelIndex + 1);
    } else {
      this.stop();
    }
  }

  private initLevel(seed: number, levelIndex?: number) {
    this.seed = seed;
    setGlobalSeed(this.seed);
    this.levelStartCounter++;
    if (levelIndex !== undefined) {
      this.initLevelTerrain(levelIndex);
    }
    this.reset();
    this.spawnEnemies();
    this.isRunning = true;
  }

  stop() {
    this.isRunning = false;
    console.log("Game stopped");
  }

  setDebugMode(enabled: boolean) {
    this.debugMode = enabled;
  }

  togglePause() {
    this.paused = !this.paused;
    console.log('Game paused:', this.paused);
    if (!this.paused && this.isRunning) {
      // Reset lastTime to avoid large deltaTime jump
      this.lastTime = performance.now();
      this.gameLoop(this.lastTime);
    }
  }

  getPaused(): boolean {
    return this.paused;
  }

  updateMobileInput(input: {
    left: boolean;
    right: boolean;
    up: boolean;
    down: boolean;
    jump: boolean;
    triggerPressed: boolean;
    aimUp: boolean;
    aimDown: boolean;
  }) {
    this.mobileInput = input;
  }

  switchWeapon(): void {
    this.player.switchWeaponInCategory();
  }

  reloadWeapon(): void {
    this.player.reload();
  }

  private reset() {
    this.bullets = [];
    this.grenades = [];
    this.rockets = [];
    this.enemies = [];
    this.allEnemies = [];
    this.activeEnemies.clear();
    this.particleSystem.clear();

    this.camera.reset();

    this.player.reset(GameEngine.PLAYER_START_X, this.terrain.getHeightAt(GameEngine.PLAYER_START_X) + 1);
    this.lastTime = performance.now()
  }

  private initLevelTerrain(levelIndex: number) {
    this.currentLevelIndex = levelIndex;
    const levelName = this.currentLevelName;
    const config = this.currentLevelConfig;
    this.terrain = new Terrain(config.terrainColor);
    this.terrain.generateTerrain(config.terrain);
    
    // Set terrain reference in camera
    this.camera.setTerrain(this.terrain);
    
    console.log(`[initLevelTerrain] Player y set to ${this.player.transform.position.y} at x=${GameEngine.PLAYER_START_X}, terrain height: ${this.terrain.getHeightAt(GameEngine.PLAYER_START_X)}`);
    console.log(`Level ${levelName} initialized`);
  }

  private setupEventListeners() {
    window.addEventListener("keydown", (e) => {
      e.stopPropagation();
      this.keys.add(e.code);
      if (e.code === 'KeyP') {
        this.togglePause();
      }
      if (e.code === 'KeyC') {
        this.player.switchWeaponInCategory();
      }
      if (e.code === 'KeyR') {
        this.player.reload();
      }
      if (e.code === 'KeyG') {
        this.player.switchWeaponCategory();
      }
    });

    window.addEventListener("keyup", (e) => {
      e.stopPropagation();
      this.keys.delete(e.code);

      if (e.code === 'KeyJ') {
        this.hasThisTriggeringShot = false;
      }
    });
  }

  private spawnEnemies() {
    this.allEnemies = [];
    const levelWidth = this.terrain.getLevelWidth();
    const screenWidth = GameEngine.SCREEN_WIDTH;
    const numScreens = Math.ceil(levelWidth / screenWidth);
    const enemiesPerScreen = this.currentLevelConfig.enemiesPerScreen;
    console.log(`[spawnEnemies] levelWidth=${levelWidth}, numScreens=${numScreens}, enemiesPerScreen=${enemiesPerScreen}`);
    // Spawn enemies starting from the second screen
    for (let screen = 1; screen < numScreens; screen++) {
      for (let i = 0; i < enemiesPerScreen; i++) {
        // Ensure x is within terrain range
        let x = Math.min(screen * screenWidth + 200 + (i * 200) + seededRandom(0, 100), levelWidth);
        // Ensure enemy never spawns to the left of the player
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

  private gameLoop(currentTime: number) {
    if (!this.isRunning) return;

    if (!this.paused) {
      const deltaTime = (currentTime - this.lastTime) / 1000;
      this.lastTime = currentTime;
      this.update(deltaTime);
      this.render();
      requestAnimationFrame((time) => this.gameLoop(time));
    } else {
      // Still render the paused frame once, but do not continue the loop
      this.render();
    }
  }

  private update(deltaTime: number) {
    this.updatePlayer(deltaTime);
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

    // Update grenades (but don't filter them yet - need to handle explosions first)
    this.grenades.forEach(grenade => {
      grenade.update(deltaTime, this.terrain);
    });

    // Update rockets (but don't filter them yet - need to handle explosions first)
    this.rockets.forEach(rocket => {
      rocket.update(deltaTime, this.terrain);
    });

    // Handle collisions (includes grenade and rocket explosions)
    this.collisionSystem.handleCollisions({
      bullets: this.bullets,
      enemies: this.enemies,
      grenades: this.grenades,
      rockets: this.rockets,
      player: this.player,
      terrain: this.terrain,
      particleSystem: this.particleSystem,
      soundManager: this.soundManager
    });

    // Now filter out inactive grenades and rockets after explosions have been handled
    this.grenades = this.grenades.filter(grenade => grenade.active);
    this.rockets = this.rockets.filter(rocket => rocket.active);

    this.particleSystem.update(deltaTime);

    this.camera.followTarget(this.player.transform.position, deltaTime);

    this.enemies = this.enemies.filter(enemy => enemy.health > 0);

    this.checkLevelCompletion();
  }

  private activateNearbyEnemies() {
    const screenWidth = GameEngine.SCREEN_WIDTH;
    const cameraX = this.camera.bottomLeftWorldX;
    let activatedCount = 0;
    // Activate enemies within 2 screens of the camera
    this.allEnemies.forEach(enemy => {
      const distanceFromCamera = Math.abs(enemy.transform.position.x - cameraX);
      if (distanceFromCamera <= screenWidth * 2 && !this.activeEnemies.has(enemy.id)) {
        this.activeEnemies.add(enemy.id);
        this.enemies.push(enemy);
        activatedCount++;
        console.log(`[activateNearbyEnemies] Activated enemy id=${enemy.id} at x=${enemy.transform.position.x}, distanceFromCamera=${distanceFromCamera}`);
      }
    });
  }

  private checkLevelCompletion() {
    const levelWidth = this.terrain.getLevelWidth();
    // Check if player reached the right edge of the level
    if (this.player.transform.position.x >= levelWidth - 100) {
      this.stop();
      if (this.currentLevelIndex < LEVEL_ORDER.length - 1) {
        useGameStore.getState().completeLevel();
      } else {
        useGameStore.getState().end();
      }
    }
  }

  private updatePlayer(deltaTime: number) {
    const input = {
      left: this.keys.has("KeyA") || this.keys.has("ArrowLeft") || this.mobileInput.left,
      right: this.keys.has("KeyD") || this.keys.has("ArrowRight") || this.mobileInput.right,
      up: this.keys.has("KeyW") || this.keys.has("ArrowUp") || this.mobileInput.up,
      down: this.keys.has("KeyS") || this.keys.has("ArrowDown") || this.mobileInput.down,
      jump: this.keys.has("Space") || this.mobileInput.jump,
      triggerPressed: this.keys.has("KeyJ") || this.mobileInput.triggerPressed,
      aimUp: this.keys.has("KeyI") || this.mobileInput.aimUp,
      aimDown: this.keys.has("KeyK") || this.mobileInput.aimDown
    };

    this.player.update(deltaTime, input, this.terrain);

    const category = this.player.getSelectedWeaponCategory();
    if (category === 'gun') {
      this.updateGunInput(input.triggerPressed);
    } else if (category === 'grenade') {
      this.updateGrenadeInput(input.triggerPressed);
    } else {
      this.updateLauncherInput(input.triggerPressed);
    }

    if (this.player.health <= 0) {
      this.stop();
      useGameStore.getState().end();
    }
  }

  private updateGunInput(triggerPressed: boolean) {
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

  private updateGrenadeInput(triggerPressed: boolean) {
    if (triggerPressed) {
      const newTriggerPress = !this.hasThisTriggeringShot;
      if (newTriggerPress && this.player.canStartThrow()) {
        this.isChargingThrow = true;
        this.throwChargeStartTime = Date.now();
        this.hasThisTriggeringShot = true;
      }
      if (this.isChargingThrow) {
        const chargeTime = Date.now() - this.throwChargeStartTime;
        this.player.setThrowPower(this.calculateThrowPower(chargeTime));
      }
    } else if (this.isChargingThrow) {
      const chargeTime = Date.now() - this.throwChargeStartTime;
      this.player.setThrowPower(this.calculateThrowPower(chargeTime));
      this.player.startThrow();
      this.isChargingThrow = false;
    }

    const completedGrenade = this.player.getCompletedGrenadeThrow();
    if (completedGrenade) {
      this.grenades.push(completedGrenade);
    }
  }

  private updateLauncherInput(triggerPressed: boolean) {
    if (!triggerPressed) return;
    const newTriggerPress = !this.hasThisTriggeringShot;
    const rocket = this.player.launch(newTriggerPress);
    if (rocket) {
      this.rockets.push(rocket);
      this.soundManager.playShoot();
      this.hasThisTriggeringShot = true;
    }
  }

  private render() {
    // Log camera position once per second
    const now = Date.now();
    if (!this.lastLogTime || now - this.lastLogTime > 1000) {
      // console.log(`Camera bottom-left: (${this.camera.bottomLeftWorldX.toFixed(1)}, ${this.camera.bottomLeftWorldY.toFixed(1)})`);
      // console.log(`Canvas size: ${this.canvas.width} x ${this.canvas.height}`);
      // console.log(`Camera transform: translate(${-this.camera.bottomLeftWorldX}, ${-this.camera.bottomLeftWorldY})`);
      // console.log(`Camera transform with toScreenY: translate(${-this.camera.bottomLeftWorldX}, ${this.camera.toScreenY(-this.camera.bottomLeftWorldY)}`);
      this.lastLogTime = now;
    }

    // Clear canvas with white background
    this.ctx.fillStyle = "white";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Save context and apply camera transform
    this.ctx.save();
    this.ctx.translate(-this.camera.bottomLeftWorldX, this.camera.toScreenY(-this.camera.bottomLeftWorldY));

    this.terrain.render(this.ctx);
    this.player.render(this.ctx);
    this.enemies.forEach(enemy => enemy.render(this.ctx));
    this.bullets.forEach(bullet => bullet.render(this.ctx));
    this.grenades.forEach(grenade => grenade.render(this.ctx));
    this.rockets.forEach(rocket => rocket.render(this.ctx));
    this.particleSystem.render(this.ctx);

    this.ctx.restore();
    this.renderUI();
  }

  private renderUI() {
    const healthBarWidth = 200;
    const healthBarHeight = 20;
    const healthPercentage = this.player.health / Player.MAX_HEALTH;
    const healthDisplay = Math.floor(this.player.health);

    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(20, 20, healthBarWidth + 4, healthBarHeight + 4);

    this.ctx.fillStyle = "red";
    this.ctx.fillRect(22, 22, healthBarWidth, healthBarHeight);

    this.ctx.fillStyle = "green";
    this.ctx.fillRect(22, 22, healthBarWidth * healthPercentage, healthBarHeight);

    // Overlay health text in white on top of the health bar
    this.ctx.fillStyle = "white";
    this.ctx.font = "16px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(`Health: ${healthDisplay}/${Player.MAX_HEALTH}`, 22 + healthBarWidth / 2, 22 + healthBarHeight / 2 + 6);
    this.ctx.textAlign = "left"; // Reset text alignment
    this.ctx.fillStyle = "black";
    this.ctx.fillText(`Level: ${this.currentLevelName}`, 22, 60);
    
    const category = this.player.getSelectedWeaponCategory();
    
    const heldObject = this.player.getHeldObject();
    this.ctx.fillText(`Weapon: ${heldObject.type.name}`, 22, 80);
    
    if (category === 'grenade') {
      this.ctx.fillText(`Grenades: ${this.player.getGrenadeCount()}/${this.player.getMaxGrenades()}`, 22, 100);
    } else if (category === 'launcher') {
      this.ctx.fillText(`Rockets: ${this.player.getRocketsLeft()}/${this.player.arsenal.heldLaunchingWeapon.type.capacity}`, 22, 100);
    } else {
      this.ctx.fillText(`Ammo: ${this.player.arsenal.heldShootingWeapon.getBulletsLeft()}/${this.player.arsenal.heldShootingWeapon.getCapacity()}`, 22, 100);
    }
    
    if (this.debugMode) {
      this.renderProgressBar();
    }

    if (this.debugMode) {
      this.renderDebugInfo();
    }
  }

  private renderProgressBar() {
    const levelWidth = this.terrain.getLevelWidth();
    const progressPercentage = Math.min(this.player.transform.position.x / levelWidth, 1);
    const progressBarWidth = 200;
    const progressBarHeight = 10;
    
    const padding = 20;
    const progressBarY = this.canvas.height - padding - progressBarHeight;
    
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(padding, progressBarY, progressBarWidth + 4, progressBarHeight + 4);
    
    this.ctx.fillStyle = "lightblue";
    this.ctx.fillRect(padding + 2, progressBarY + 2, progressBarWidth * progressPercentage, progressBarHeight);
    
    this.ctx.fillStyle = "white";
    this.ctx.font = "12px Arial";
    this.ctx.textAlign = "center";
    this.ctx.fillText(`${Math.round(progressPercentage * 100)}%`, padding + progressBarWidth / 2, progressBarY + progressBarHeight / 2 + 6);
    this.ctx.textAlign = "left"; // Reset text alignment
  }

  private renderDebugInfo() {
    const player = this.player;
    const terrainHeight = this.terrain.getHeightAt(player.transform.position.x);
    const playerTop = player.transform.position.y - player.bounds.height / 2;
    const debugLines = [
      `Debug Info:`,
      `Terrain Height: ${terrainHeight?.toFixed(2)}`,
      `Player X: ${player.transform.position.x.toFixed(2)}`,
      `Player Y: ${player.transform.position.y.toFixed(2)}`,
      `Player Top: ${playerTop.toFixed(2)}`,
      `Velocity X: ${player.velocity.x.toFixed(2)}`,
      `Velocity Y: ${player.velocity.y.toFixed(2)}`
    ];
    this.ctx.font = "14px monospace";
    this.ctx.fillStyle = "#222";

    const padding = 20;
    const lineHeight = 20;
    const startY = this.canvas.height - padding - debugLines.length * lineHeight;
    debugLines.forEach((line, i) => {
      this.ctx.fillText(line, 30, startY + i * lineHeight);
    });
  }

}
