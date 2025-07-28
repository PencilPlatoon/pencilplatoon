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
  private keys: Set<string> = new Set();
  private currentLevelIndex = 0;
  private get currentLevelName() {
    return LEVEL_ORDER[this.currentLevelIndex];
  }
  private get currentLevelConfig(): LevelConfig {
    return LEVEL_DEFINITIONS[this.currentLevelName];
  }
  private debugMode = false;
  private paused = false;

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
    this.setupEventListeners();
  }

  init() {
    this.initLevel(this.currentLevelIndex);
    console.log("Game engine initialized");
  }

  initLevel(levelIndex: number) {
    this.currentLevelIndex = levelIndex;
    const levelName = this.currentLevelName;
    const config = this.currentLevelConfig;
    this.terrain = new Terrain(config.terrainColor);
    this.terrain.generateTerrain(config.terrain);
    // After terrain is generated, reset player position to just above terrain height
    this.player.transform.setPosition(GameEngine.PLAYER_START_X, this.terrain.getHeightAt(GameEngine.PLAYER_START_X) + 1);
    this.player.velocity.x = 0;
    this.player.velocity.y = 1;
    this.player.health = this.player.maxHealth;
    this.player.active = true;
    this.bullets = [];
    this.activeEnemies.clear();
    this.enemies = [];
    this.allEnemies = [];
    this.particleSystem.clear();
    // Reset camera to start
    this.camera.x = 0;
    this.camera.y = 0;
    this.spawnEnemies();
    console.log(`[initLevel] Player y set to ${this.player.transform.position.y} at x=${GameEngine.PLAYER_START_X}, terrain height: ${this.terrain.getHeightAt(GameEngine.PLAYER_START_X)}`);
    console.log(`Level ${levelName} initialized`);
  }

  async start() {
    await this.player.waitForLoaded();
    await Promise.all(this.allEnemies.map(e => e.waitForLoaded()));
    console.log("Game engine: everything loaded");
    this.isRunning = true;
    this.gameLoop(0);
    console.log("Game started");
  }

  restart() {
    this.bullets = [];
    this.enemies = [];
    this.allEnemies = [];
    this.activeEnemies.clear();
    this.particleSystem.clear();
    this.currentLevelIndex = 0;
    this.initLevel(this.currentLevelIndex);
    this.isRunning = true;
    console.log("Game restarted");
  }

  nextLevel() {
    if (this.currentLevelIndex < LEVEL_ORDER.length - 1) {
      this.currentLevelIndex++;
      this.bullets = [];
      this.enemies = [];
      this.allEnemies = [];
      this.activeEnemies.clear();
      this.particleSystem.clear();
      // Fully reset player state
      this.player.transform.setPosition(GameEngine.PLAYER_START_X, this.terrain.getHeightAt(GameEngine.PLAYER_START_X) + 1);
      this.player.velocity.x = 0;
      this.player.velocity.y = 1;
      this.player.health = this.player.maxHealth;
      this.player.active = true;
      // Reset camera to start
      this.camera.x = 0;
      this.camera.y = 0;
      this.initLevel(this.currentLevelIndex);
      this.isRunning = true;
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
  }

  private setupEventListeners() {
    // Keyboard events
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyP') {
        this.togglePause();
      }
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
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
        let x = Math.min(screen * screenWidth + 200 + (i * 200) + Math.random() * 100, levelWidth);
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
    }
    this.render();
    requestAnimationFrame((time) => this.gameLoop(time));
  }

  private update(deltaTime: number) {
    // Update player
    this.updatePlayer(deltaTime);

    // Activate enemies when they come on screen
    this.activateNearbyEnemies();

    // Update active enemies
    this.enemies.forEach(enemy => {
      enemy.update(deltaTime, this.player.transform.position, this.terrain);
      
      // Enemy shooting
      if (enemy.canShoot(this.player.transform.position)) {
        const bullet = enemy.shoot(this.player.transform.position);
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
    const cameraX = this.camera.x;
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
      if (this.currentLevelIndex < LEVEL_ORDER.length - 1) {
        this.nextLevel();
      } else {
        this.stop();
        useGameStore.getState().end();
      }
    }
  }

  private updatePlayer(deltaTime: number) {
    // Handle player input
    const input = {
      left: this.keys.has("KeyA") || this.keys.has("ArrowLeft"),
      right: this.keys.has("KeyD") || this.keys.has("ArrowRight"),
      up: this.keys.has("KeyW") || this.keys.has("ArrowUp"),
      down: this.keys.has("KeyS") || this.keys.has("ArrowDown"),
      jump: this.keys.has("Space"),
      shoot: this.keys.has("KeyJ"),
      aimUp: this.keys.has("KeyI"),
      aimDown: this.keys.has("KeyK")
    };

    this.player.update(deltaTime, input, this.terrain);

    // Player shooting
    if (input.shoot && this.player.canShoot()) {
      const bullet = this.player.shoot();
      if (bullet) {
        this.bullets.push(bullet);
        this.soundManager.playShoot();
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
            bullet.previousPosition.x, bullet.previousPosition.y,
            bullet.transform.position.x, bullet.transform.position.y,
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
          bullet.previousPosition.x, bullet.previousPosition.y,
          bullet.transform.position.x, bullet.transform.position.y,
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
    // Clear canvas with white background
    this.ctx.fillStyle = "white";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Save context and apply camera transform
    this.ctx.save();
    this.ctx.translate(-this.camera.x, -this.camera.y);

    // Render terrain
    this.terrain.render(this.ctx);

    // Render player
    this.player.render(this.ctx);

    // Render enemies
    this.enemies.forEach(enemy => enemy.render(this.ctx, this.player.transform.position));

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
    // Pause button
    const buttonWidth = 80;
    const buttonHeight = 32;
    const buttonX = 22;
    const buttonY = 160;
    this.ctx.fillStyle = this.paused ? '#aaa' : '#222';
    this.ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
    this.ctx.fillStyle = 'white';
    this.ctx.font = '18px Arial';
    this.ctx.fillText(this.paused ? 'Resume' : 'Pause', buttonX + 10, buttonY + 22);
    // Listen for click
    this.canvas.addEventListener('click', this.handlePauseButtonClick);

    // Health bar
    const healthBarWidth = 200;
    const healthBarHeight = 20;
    const healthPercentage = this.player.health / this.player.maxHealth;

    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(20, 20, healthBarWidth + 4, healthBarHeight + 4);

    this.ctx.fillStyle = "red";
    this.ctx.fillRect(22, 22, healthBarWidth, healthBarHeight);

    this.ctx.fillStyle = "green";
    this.ctx.fillRect(22, 22, healthBarWidth * healthPercentage, healthBarHeight);

    // Game info text
    this.ctx.fillStyle = "black";
    this.ctx.font = "16px Arial";
    this.ctx.fillText(`Health: ${this.player.health}/${this.player.maxHealth}`, 22, 60);
    this.ctx.fillText(`Level: ${this.currentLevelName}`, 22, 80);
    this.ctx.fillText(`Enemies: ${this.enemies.length}`, 22, 100);
    
    // Progress indicator
    const levelWidth = this.terrain.getLevelWidth();
    const progressPercentage = Math.min(this.player.transform.position.x / levelWidth, 1);
    const progressBarWidth = 200;
    const progressBarHeight = 10;
    
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    this.ctx.fillRect(20, 110, progressBarWidth + 4, progressBarHeight + 4);
    
    this.ctx.fillStyle = "lightblue";
    this.ctx.fillRect(22, 112, progressBarWidth * progressPercentage, progressBarHeight);
    
    this.ctx.fillStyle = "black";
    this.ctx.font = "12px Arial";
    this.ctx.fillText(`Progress: ${Math.round(progressPercentage * 100)}%`, 22, 135);

    // Debug info at bottom of screen
    if (this.debugMode) {
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

  handlePauseButtonClick = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const buttonX = 22;
    const buttonY = 160;
    const buttonWidth = 80;
    const buttonHeight = 32;
    if (x >= buttonX && x <= buttonX + buttonWidth && y >= buttonY && y <= buttonY + buttonHeight) {
      this.togglePause();
    }
  }
}
