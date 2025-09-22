import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { Terrain } from "./Terrain";
import { ParticleSystem } from "./ParticleSystem";
import { Camera } from "./Camera";
import { CollisionSystem } from "./CollisionSystem";
import { Bullet } from "./Bullet";
import { useGameStore } from "../lib/stores/useGameStore";
import { SoundManager } from "./SoundManager";
import { LEVEL_DEFINITIONS, LEVEL_ORDER, LevelConfig } from "./LevelConfig";
import { setGlobalSeed, seededRandom } from "../lib/utils";

export class GameEngine {
  static readonly SCREEN_WIDTH = 800;
  static readonly PLAYER_START_X = 50;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private player: Player;
  private enemies: Enemy[] = [];
  private allEnemies: Enemy[] = []; // All enemies for the level
  private activeEnemies: Set<string> = new Set(); // Track which enemies are active
  private bullets: Bullet[] = [];
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
    shoot: boolean;
    aimUp: boolean;
    aimDown: boolean;
  } = {
    left: false,
    right: false,
    up: false,
    down: false,
    jump: false,
    shoot: false,
    aimUp: false,
    aimDown: false
  };
  private hasThisTriggeringShot = false;
  private currentLevelIndex = 0;
  private get currentLevelName() {
    return LEVEL_ORDER[this.currentLevelIndex];
  }
  private get currentLevelConfig(): LevelConfig {
    return LEVEL_DEFINITIONS[this.currentLevelName];
  }
  private debugMode = false;
  private paused = false;
  private seed: number = 12345;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.camera = new Camera(canvas.width, canvas.height);
    this.terrain = new Terrain(this.currentLevelConfig.terrainColor);
    this.particleSystem = new ParticleSystem();
    this.soundManager = new SoundManager();
    this.collisionSystem = new CollisionSystem();
    // Create player at far left spawn position, at the top of the world
    this.player = new Player(GameEngine.PLAYER_START_X, Terrain.WORLD_TOP);
    
    setGlobalSeed(this.seed);
    
    this.initLevelTerrain(this.currentLevelIndex);
    this.reset();
    this.spawnEnemies();

    this.setupEventListeners();

    console.log("Game engine initialized");
  }

  setSeed(seed: number): void {
    this.seed = seed;
    setGlobalSeed(seed);
    this.initLevelTerrain(this.currentLevelIndex);
    this.spawnEnemies();
  }

  async start() {
    await this.player.waitForLoaded();
    await Promise.all(this.allEnemies.map(e => e.waitForLoaded()));
    console.log("Game engine: everything loaded");
    this.isRunning = true;
    this.gameLoop(0);
    console.log("Game started");
  }

  restartGame() {
    this.currentLevelIndex = 0;
    setGlobalSeed(this.seed);
    this.initLevelTerrain(0);
    this.reset();
    this.spawnEnemies();
    this.isRunning = true;
    console.log("Game restarted from beginning");
  }

  restartLevel() {
    setGlobalSeed(this.seed);
    //this.initLevelTerrain(this.currentLevelIndex);
    this.reset();
    this.spawnEnemies();
    this.isRunning = true;
    console.log(`Level ${this.currentLevelName} restarted`);
  }

  nextLevel() {
    if (this.currentLevelIndex < LEVEL_ORDER.length - 1) {
      setGlobalSeed(this.seed);
      this.initLevelTerrain(this.currentLevelIndex+1);
      this.reset();
      this.spawnEnemies();
      console.log("Next level started");
    } else {
      this.stop();
      // Game over logic here if needed
      console.log("Game over: All levels completed.");
    }
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
    shoot: boolean;
    aimUp: boolean;
    aimDown: boolean;
  }) {
    this.mobileInput = input;
  }

  switchWeapon(): void {
    this.player.switchToNextWeapon();
  }

  reloadWeapon(): void {
    this.player.reloadWeapon();
  }

  private reset() {
    this.bullets = [];
    this.enemies = [];
    this.allEnemies = [];
    this.activeEnemies.clear();
    this.particleSystem.clear();

    this.camera.reset();

    this.player.reset(GameEngine.PLAYER_START_X, this.terrain.getHeightAt(GameEngine.PLAYER_START_X) + 1);
  }

  private initLevelTerrain(levelIndex: number) {
    this.currentLevelIndex = levelIndex;
    const levelName = this.currentLevelName;
    const config = this.currentLevelConfig;
    this.terrain = new Terrain(config.terrainColor);
    this.terrain.generateTerrain(config.terrain);
    
    // Set terrain reference in camera
    this.camera.setTerrain(this.terrain);
    
    console.log(`[initLevel] Player y set to ${this.player.transform.position.y} at x=${GameEngine.PLAYER_START_X}, terrain height: ${this.terrain.getHeightAt(GameEngine.PLAYER_START_X)}`);
    console.log(`Level ${levelName} initialized`);
  }

  private setupEventListeners() {
    // Keyboard events
    window.addEventListener("keydown", (e) => {
      e.stopPropagation();
      this.keys.add(e.code);
      if (e.code === 'KeyP') {
        this.togglePause();
      }
      if (e.code === 'KeyC') {
        this.player.switchToNextWeapon();
      }
      if (e.code === 'KeyR') {
        this.player.reloadWeapon();
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
        const enemy = new Enemy(x, y, `enemy_${screen}_${i}`);
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
    // Update player
    this.updatePlayer(deltaTime);

    // Activate enemies when they come on screen
    this.activateNearbyEnemies();

    // Update active enemies
    this.enemies.forEach(enemy => {
      const playerCOG = this.player.getCenterOfGravity();
      enemy.update(deltaTime, playerCOG, this.terrain);
      
      // Enemy shooting
      if (enemy.canShoot(playerCOG)) {
        const bullet = enemy.shoot(playerCOG);
        if (bullet) {
          this.bullets.push(bullet);
        }
      }
    });

    // Update bullets
    this.bullets = this.bullets.filter(bullet => {
      bullet.update(deltaTime);
      return bullet.active;
    });

    // Handle collisions
    this.handleCollisions();

    // Update particles
    this.particleSystem.update(deltaTime);

    // Update camera to follow player
    this.camera.followTarget(this.player.transform.position, deltaTime);

    // Remove dead enemies
    this.enemies = this.enemies.filter(enemy => enemy.health > 0);

    // Check level completion
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
    // Handle player input - combine keyboard and mobile input
    const input = {
      left: this.keys.has("KeyA") || this.keys.has("ArrowLeft") || this.mobileInput.left,
      right: this.keys.has("KeyD") || this.keys.has("ArrowRight") || this.mobileInput.right,
      up: this.keys.has("KeyW") || this.keys.has("ArrowUp") || this.mobileInput.up,
      down: this.keys.has("KeyS") || this.keys.has("ArrowDown") || this.mobileInput.down,
      jump: this.keys.has("Space") || this.mobileInput.jump,
      shoot: this.keys.has("KeyJ") || this.mobileInput.shoot,
      aimUp: this.keys.has("KeyI") || this.mobileInput.aimUp,
      aimDown: this.keys.has("KeyK") || this.mobileInput.aimDown
    };

    this.player.update(deltaTime, input, this.terrain);

    if (input.shoot) {
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

    // Check if player died
    if (this.player.health <= 0) {
      this.stop();
      // Trigger game over
      import("../lib/stores/useGameStore").then(({ useGameStore }) => {
        useGameStore.getState().end();
      });
    }
  }

  private handleCollisions() {
    // Bullet vs Enemy collisions
    this.bullets.forEach(bullet => {
      if (!bullet.active) return;

      this.enemies.forEach(enemy => {
        const bulletAbs = bullet.getAbsoluteBounds();
        const enemyAbs = enemy.getAbsoluteBounds();
        if (
          this.collisionSystem.checkCollision(bulletAbs, enemyAbs) ||
          this.collisionSystem.checkLineIntersectsRect(
            bullet.previousPosition,
            bullet.transform.position,
            enemyAbs
          )
        ) {
          // Hit enemy
          enemy.takeDamage(bullet.damage);
          bullet.deactivate('hit-enemy');
          // Create explosion effect
          this.particleSystem.createExplosion(bullet.transform.position, 'enemy');
          this.soundManager.playHit();
        }
      });
    });

    // Enemy bullet vs Player collisions
    this.bullets.forEach(bullet => {
      if (!bullet.active) return;

      const bulletAbs = bullet.getAbsoluteBounds();
      const playerAbs = this.player.getAbsoluteBounds();
      if (
        this.collisionSystem.checkCollision(bulletAbs, playerAbs) ||
        this.collisionSystem.checkLineIntersectsRect(
          bullet.previousPosition,
          bullet.transform.position,
          playerAbs
        )
      ) {
        // Hit player
        this.player.takeDamage(bullet.damage);
        bullet.deactivate('hit-player');
        // Create explosion effect
        this.particleSystem.createExplosion(bullet.transform.position, 'player');
        this.soundManager.playHit();
      }
    });

    // Bullet vs Terrain collisions
    this.bullets.forEach(bullet => {
      if (!bullet.active) return;

      const bulletAbs = bullet.getAbsoluteBounds();
      if (this.terrain.checkCollision(bulletAbs)) {
        bullet.deactivate('hit-terrain', this.terrain);
        this.particleSystem.createExplosion(bullet.transform.position, 'terrain');
      }
    });
  }

  private render() {
    // Log camera position once per second
    const now = Date.now();
    if (!this.lastLogTime || now - this.lastLogTime > 1000) {
      console.log(`Camera bottom-left: (${this.camera.bottomLeftWorldX.toFixed(1)}, ${this.camera.bottomLeftWorldY.toFixed(1)})`);
      console.log(`Canvas size: ${this.canvas.width} x ${this.canvas.height}`);
      console.log(`Camera transform: translate(${-this.camera.bottomLeftWorldX}, ${-this.camera.bottomLeftWorldY})`);
      console.log(`Camera transform with toScreenY: translate(${-this.camera.bottomLeftWorldX}, ${this.camera.toScreenY(-this.camera.bottomLeftWorldY)}`);
      this.lastLogTime = now;
    }

    // Clear canvas with white background
    this.ctx.fillStyle = "white";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Save context and apply camera transform
    this.ctx.save();
    this.ctx.translate(-this.camera.bottomLeftWorldX, this.camera.toScreenY(-this.camera.bottomLeftWorldY));

    // Render terrain
    this.terrain.render(this.ctx);

    // Render player
    this.player.render(this.ctx);

    // Render enemies
    this.enemies.forEach(enemy => enemy.render(this.ctx));

    // Render bullets
    this.bullets.forEach(bullet => bullet.render(this.ctx));

    // Render particles
    this.particleSystem.render(this.ctx);

    // Restore context
    this.ctx.restore();

    // Render UI (not affected by camera)
    this.renderUI();
  }

  private renderUI() {
    // Health bar
    const healthBarWidth = 200;
    const healthBarHeight = 20;
    const healthPercentage = this.player.health / Player.MAX_HEALTH;

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
    this.ctx.fillText(`Health: ${this.player.health}/${Player.MAX_HEALTH}`, 22 + healthBarWidth / 2, 22 + healthBarHeight / 2 + 6);
    this.ctx.textAlign = "left"; // Reset text alignment
    this.ctx.fillStyle = "black";
    this.ctx.fillText(`Level: ${this.currentLevelName}`, 22, 60);
    this.ctx.fillText(`Weapon: ${this.player.weapon.name}`, 22, 80);
    this.ctx.fillText(`Ammo: ${this.player.weapon.getBulletsLeft()}/${this.player.weapon.getCapacity()}`, 22, 100);
    
    // Progress indicator
    if (this.debugMode) {
      this.renderProgressBar();
    }

    // Debug info at bottom of screen
    if (this.debugMode) {
      this.renderDebugInfo();
    }
  }

  private renderProgressBar() {
    const levelWidth = this.terrain.getLevelWidth();
    const progressPercentage = Math.min(this.player.transform.position.x / levelWidth, 1);
    const progressBarWidth = 200;
    const progressBarHeight = 10;
    
    // Position at bottom left with padding
    const padding = 20;
    const progressBarY = this.canvas.height - padding - progressBarHeight;
    
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(padding, progressBarY, progressBarWidth + 4, progressBarHeight + 4);
    
    this.ctx.fillStyle = "lightblue";
    this.ctx.fillRect(padding + 2, progressBarY + 2, progressBarWidth * progressPercentage, progressBarHeight);
    
    // Overlay percentage text in white on top of the bar
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
    // Position debug info above the bottom edge, with padding
    const padding = 20;
    const lineHeight = 20;
    const startY = this.canvas.height - padding - debugLines.length * lineHeight;
    debugLines.forEach((line, i) => {
      this.ctx.fillText(line, 30, startY + i * lineHeight);
    });
  }

}
