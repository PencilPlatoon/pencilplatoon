import { Player } from "./Player";
import { Enemy } from "./Enemy";
import { Terrain } from "./Terrain";
import { ParticleSystem } from "./ParticleSystem";
import { Camera } from "./Camera";
import { CollisionSystem } from "./CollisionSystem";
import { Bullet } from "./Bullet";
import { Grenade } from "./Grenade";
import { useGameStore } from "../lib/stores/useGameStore";
import { SoundManager } from "./SoundManager";
import { LEVEL_DEFINITIONS, LEVEL_ORDER, LevelConfig } from "./LevelConfig";
import { setGlobalSeed, seededRandom } from "../lib/utils";
import { DamageableEntity } from "./types";

export class GameEngine {
  static readonly SCREEN_WIDTH = 800;
  static readonly PLAYER_START_X = 50;
  static readonly MAX_CHARGE_TIME_MS = 1000;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private player: Player;
  private enemies: Enemy[] = [];
  private allEnemies: Enemy[] = []; // All enemies for the level
  private activeEnemies: Set<string> = new Set(); // Track which enemies are active
  private bullets: Bullet[] = [];
  private grenades: Grenade[] = [];
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
    // Create player at far left spawn position, at the top of the world
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
    console.log("GameEngine.startGame");
    this.seed = seed;
    setGlobalSeed(this.seed);
    this.levelStartCounter++;
    this.initLevelTerrain(this.currentLevelIndex);
    this.reset();
    this.spawnEnemies();
    this.isRunning = true;
    console.log("Game started");
  }

  restartGame(seed: number) {
    console.log("GameEngine.restartGame");
    this.currentLevelIndex = 0;
    this.seed = seed;
    setGlobalSeed(this.seed);
    this.levelStartCounter++;
    this.initLevelTerrain(0);
    this.reset();
    this.spawnEnemies();
    this.isRunning = true;
    console.log("Game restarted from beginning");
  }

  restartLevel(seed: number) {
    console.log("GameEngine.restartLevel");
    this.seed = seed;
    setGlobalSeed(this.seed);
    this.levelStartCounter++;
    //this.initLevelTerrain(this.currentLevelIndex);
    this.reset();
    this.spawnEnemies();
    this.isRunning = true;
    console.log(`Level ${this.currentLevelName} restarted`);
  }

  nextLevel(seed: number) {
    console.log("GameEngine.nextLevel");
    if (this.currentLevelIndex < LEVEL_ORDER.length - 1) {
      this.seed = seed;
      setGlobalSeed(this.seed);
      this.levelStartCounter++;
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
    triggerPressed: boolean;
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
    this.grenades = [];
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
    // Keyboard events
    window.addEventListener("keydown", (e) => {
      e.stopPropagation();
      this.keys.add(e.code);
      if (e.code === 'KeyP') {
        this.togglePause();
      }
      if (e.code === 'KeyC') {
        if (this.player.getSelectedWeaponCategory() === 'gun') {
          this.player.switchToNextWeapon();
        } else {
          this.player.switchToNextGrenade();
        }
      }
      if (e.code === 'KeyR') {
        if (this.player.getSelectedWeaponCategory() === 'gun') {
          this.player.reloadWeapon();
        }
        // In grenade mode, R does nothing (hand-thrown weapon)
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

    // Update grenades (but don't filter them yet - need to handle explosions first)
    this.grenades.forEach(grenade => {
      grenade.update(deltaTime, this.terrain);
    });

    // Handle collisions (includes grenade explosions)
    this.handleCollisions();

    // Now filter out inactive grenades after explosions have been handled
    this.grenades = this.grenades.filter(grenade => grenade.active);

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
      triggerPressed: this.keys.has("KeyJ") || this.mobileInput.triggerPressed,
      aimUp: this.keys.has("KeyI") || this.mobileInput.aimUp,
      aimDown: this.keys.has("KeyK") || this.mobileInput.aimDown
    };

    this.player.update(deltaTime, input, this.terrain);

    if (this.player.getSelectedWeaponCategory() === 'gun') {
      if (input.triggerPressed) {
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
    } else {
      if (input.triggerPressed) {
        const newTriggerPress = !this.hasThisTriggeringShot;
        
        // Start charging on first press (only if player can throw)
        if (newTriggerPress && this.player.canStartThrow()) {
          this.isChargingThrow = true;
          this.throwChargeStartTime = Date.now();
          this.hasThisTriggeringShot = true;
          console.log(`[GRENADE] Started charging throw`);
        }
        
        // While trigger is held, update current throw power for aim line display
        if (this.isChargingThrow) {
          const chargeTime = Date.now() - this.throwChargeStartTime;
          const currentPower = this.calculateThrowPower(chargeTime);
          this.player.setThrowPower(currentPower);
        }
      } else if (this.isChargingThrow) {
        // Trigger was released - calculate final power and start throw animation
        const chargeTime = Date.now() - this.throwChargeStartTime;
        const finalThrowPower = this.calculateThrowPower(chargeTime);
        
        console.log(`[GRENADE] Released after ${chargeTime}ms charge, final power: ${finalThrowPower.toFixed(2)}`);
        this.player.setThrowPower(finalThrowPower);
        this.player.startThrow();
        this.isChargingThrow = false;
      }

      const completedGrenade = this.player.getCompletedGrenadeThrow();
      if (completedGrenade) {
        console.log(`[GameEngine] Completed grenade throw: ${completedGrenade}`);
        this.grenades.push(completedGrenade);
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

    // Handle grenade explosions
    this.grenades.forEach(grenade => {
      if (!grenade.active && grenade.isExploded()) {
        this.handleGrenadeExplosion(grenade);
      }
    });
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

    // Render terrain
    this.terrain.render(this.ctx);

    // Render player
    this.player.render(this.ctx);

    // Render enemies
    this.enemies.forEach(enemy => enemy.render(this.ctx));

    // Render bullets
    this.bullets.forEach(bullet => bullet.render(this.ctx));

    // Render grenades
    this.grenades.forEach(grenade => grenade.render(this.ctx));

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
    
    if (this.player.getSelectedWeaponCategory() === 'grenade') {
      this.ctx.fillText(`Weapon: Hand Grenade`, 22, 80);
      this.ctx.fillText(`Grenades: ${this.player.getGrenadeCount()}/${this.player.getMaxGrenades()}`, 22, 100);
    } else {
      this.ctx.fillText(`Weapon: ${this.player.weapon.name}`, 22, 80);
      this.ctx.fillText(`Ammo: ${this.player.weapon.getBulletsLeft()}/${this.player.weapon.getCapacity()}`, 22, 100);
    }
    
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

  private applyExplosionDamage(
    entity: DamageableEntity,
    explosionPos: { x: number; y: number },
    explosionRadius: number,
    explosionDamage: number
  ): void {
    const center = entity.getCenterOfGravity();
    const distance = Math.sqrt(
      Math.pow(center.x - explosionPos.x, 2) + 
      Math.pow(center.y - explosionPos.y, 2)
    );
    
    if (distance <= explosionRadius) {
      // Calculate damage based on distance (more damage closer to center)
      const damageMultiplier = 1 - (distance / explosionRadius);
      const finalDamage = explosionDamage * damageMultiplier;
      entity.takeDamage(finalDamage);
      console.log(`[GRENADE] ${entity.getEntityLabel()} hit for ${finalDamage.toFixed(1)} damage at distance ${distance.toFixed(1)}`);
    }
  }

  private handleGrenadeExplosion(grenade: Grenade) {
    const explosionPos = grenade.transform.position;
    const explosionRadius = grenade.getExplosionRadius();
    const explosionDamage = grenade.getExplosionDamage();
    
    console.log(`[GRENADE] Explosion at (${explosionPos.x.toFixed(1)}, ${explosionPos.y.toFixed(1)}) with radius ${explosionRadius}`);
    
    // Create explosion particle effect with radius-scaled animation
    this.particleSystem.createExplosion(explosionPos, 'grenade', explosionRadius);
    this.soundManager.playHit(); // Use hit sound for explosion
    
    // Damage enemies within explosion radius
    this.enemies.forEach(enemy => {
      this.applyExplosionDamage(enemy, explosionPos, explosionRadius, explosionDamage);
    });
    
    // Damage player if within explosion radius
    this.applyExplosionDamage(this.player, explosionPos, explosionRadius, explosionDamage);
  }

}
