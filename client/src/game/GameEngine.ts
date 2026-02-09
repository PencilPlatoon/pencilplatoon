import { useGameStore } from "@/stores/useGameStore";
import { GameWorld } from "./GameWorld";
import { resolveInput, PlayerInput, EMPTY_INPUT } from "./InputResolver";
import { renderWorld } from "./GameRenderer";
import { LEVEL_ORDER } from "./world/LevelConfig";

export { calculateThrowPower } from "./GameWorld";

export class GameEngine {
  static readonly SCREEN_WIDTH = GameWorld.SCREEN_WIDTH;
  static readonly PLAYER_START_X = GameWorld.PLAYER_START_X;
  static readonly MAX_CHARGE_TIME_MS = GameWorld.MAX_CHARGE_TIME_MS;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameWorld: GameWorld;
  private isRunning = false;
  private lastTime = 0;
  private keys: Set<string> = new Set();
  private mobileInput: PlayerInput = { ...EMPTY_INPUT };
  private paused = false;

  constructor(canvas: HTMLCanvasElement) {
    console.log("GameEngine constructor");
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;

    this.gameWorld = new GameWorld(canvas.width, canvas.height, {
      getNow: Date.now,
      onLevelComplete: () => {
        this.stop();
        useGameStore.getState().completeLevel();
      },
      onGameOver: () => {
        this.stop();
        useGameStore.getState().end();
      },
      onFinalLevelComplete: () => {
        this.stop();
        useGameStore.getState().end();
      },
    });

    this.setupEventListeners();
    console.log("Game engine initialized");
  }

  async start() {
    await this.gameWorld.player.waitForLoaded();
    await Promise.all(this.gameWorld.allEnemies.map(e => e.waitForLoaded()));
    console.log("Game engine: everything loaded");
    this.isRunning = true;
    this.lastTime = performance.now();
    this.gameLoop(this.lastTime);
    console.log("Game started");
  }

  startGame(seed: number) {
    this.gameWorld.initLevel(seed, this.gameWorld.currentLevelIndex);
  }

  restartGame(seed: number) {
    this.gameWorld.initLevel(seed, 0);
  }

  restartLevel(seed: number) {
    this.gameWorld.initLevel(seed);
  }

  nextLevel(seed: number) {
    if (this.gameWorld.currentLevelIndex < LEVEL_ORDER.length - 1) {
      this.gameWorld.initLevel(seed, this.gameWorld.currentLevelIndex + 1);
    } else {
      this.stop();
    }
  }

  stop() {
    this.isRunning = false;
    console.log("Game stopped");
  }

  setDebugMode(enabled: boolean) {
    this.gameWorld.debugMode = enabled;
  }

  togglePause() {
    this.paused = !this.paused;
    console.log("Game paused:", this.paused);
    if (!this.paused && this.isRunning) {
      this.lastTime = performance.now();
      this.gameLoop(this.lastTime);
    }
  }

  getPaused(): boolean {
    return this.paused;
  }

  updateMobileInput(input: PlayerInput) {
    this.mobileInput = input;
  }

  switchWeapon(): void {
    this.gameWorld.switchWeapon();
  }

  reloadWeapon(): void {
    this.gameWorld.reloadWeapon();
  }

  private setupEventListeners() {
    window.addEventListener("keydown", (e) => {
      e.stopPropagation();
      this.keys.add(e.code);
      if (e.code === "KeyP") {
        this.togglePause();
      }
      if (e.code === "KeyC") {
        this.gameWorld.switchWeapon();
      }
      if (e.code === "KeyR") {
        this.gameWorld.reloadWeapon();
      }
      if (e.code === "KeyG") {
        this.gameWorld.switchWeaponCategory();
      }
    });

    window.addEventListener("keyup", (e) => {
      e.stopPropagation();
      this.keys.delete(e.code);

      if (e.code === "KeyJ") {
        this.gameWorld.clearTriggerState();
      }
    });
  }

  private gameLoop(currentTime: number) {
    if (!this.isRunning) return;

    if (!this.paused) {
      const deltaTime = (currentTime - this.lastTime) / 1000;
      this.lastTime = currentTime;
      const input = resolveInput(this.keys, this.mobileInput);
      this.gameWorld.update(deltaTime, input);
      renderWorld(this.ctx, this.canvas, this.gameWorld);
      requestAnimationFrame((time) => this.gameLoop(time));
    } else {
      renderWorld(this.ctx, this.canvas, this.gameWorld);
    }
  }
}
