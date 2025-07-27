import { GameObject, Vector2 } from "./types";
import { BoundingBox } from "./BoundingBox";
import { Bullet } from "./Bullet";
import { Terrain } from "./Terrain";
import { HumanFigure } from "../figures/HumanFigure";
import { HealthBarFigure } from "../figures/HealthBarFigure";
import { BoundingBoxFigure } from "../figures/BoundingBoxFigure";
import { Weapon } from "./Weapon";

declare global {
  interface Window {
    __DEBUG_MODE__?: boolean;
  }
}

export class Enemy implements GameObject {
  id: string;
  position: Vector2;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  health: number;
  maxHealth: number;
  
  private speed = 150;
  private detectionRange = 400;
  private shootingRange = 300;
  private lastShotTime = 0;
  private weapon: Weapon;
  private facing = 1;
  private patrolDirection = 1;
  private patrolStartX: number;
  private patrolRange = 200;
  private gravity = 1500;
  private fireInterval = 800; // ms, distinct from weapon fireInterval

  static readonly HEALTHBAR_OFFSET_Y = 20;

  getWeaponPosition() {
    return {
      x: this.position.x + (this.facing * HumanFigure.ARM_LENGTH),
      y: this.position.y + HumanFigure.HAND_OFFSET_Y
    };
  }

  constructor(x: number, y: number, id: string) {
    this.id = id;
    // position.y is now feet (bottom of enemy)
    this.position = { x, y };
    this.velocity = { x: 0, y: 1 };
    this.bounds = new BoundingBox(HumanFigure.getWidth(), HumanFigure.getHeight(), 0.5, 0.0);
    this.active = true;
    this.health = 75;
    this.maxHealth = 75;
    this.patrolStartX = x;
    
    this.weapon = new Weapon(Weapon.RIFLE_A_MAIN_OFFENSIVE);
  }

  update(deltaTime: number, playerPos: Vector2, terrain: Terrain) {
    const distanceToPlayer = Math.sqrt(
      Math.pow(playerPos.x - this.position.x, 2) + 
      Math.pow(playerPos.y - this.position.y, 2)
    );

    if (distanceToPlayer <= this.detectionRange) {
      // Chase player
      this.chasePlayer(playerPos, deltaTime);
    } else {
      // Patrol
      this.patrol(deltaTime);
    }

    // Apply gravity
    this.velocity.y -= this.gravity * deltaTime;

    // Update position
    this.position.x += this.velocity.x * deltaTime;
    this.position.y += this.velocity.y * deltaTime;
    // Clamp x to valid terrain range
    this.position.x = Math.max(0, Math.min(this.position.x, terrain.getLevelWidth()));

    // Terrain collision with gravity
    this.handleTerrainCollision(terrain);
  }

  private chasePlayer(playerPos: Vector2, deltaTime: number) {
    const dx = playerPos.x - this.position.x;
    
    if (Math.abs(dx) > 50) { // Don't get too close
      if (dx > 0) {
        this.velocity.x = this.speed;
        this.facing = 1;
      } else {
        this.velocity.x = -this.speed;
        this.facing = -1;
      }
    } else {
      this.velocity.x = 0;
    }
  }

  private patrol(deltaTime: number) {
    // Simple patrol behavior
    const distanceFromStart = this.position.x - this.patrolStartX;
    
    if (distanceFromStart > this.patrolRange) {
      this.patrolDirection = -1;
    } else if (distanceFromStart < -this.patrolRange) {
      this.patrolDirection = 1;
    }

    this.velocity.x = this.patrolDirection * this.speed * 0.5;
    this.facing = this.patrolDirection;
  }

  private handleTerrainCollision(terrain: Terrain) {
    const terrainY = terrain.getHeightAt(this.position.x);
    if (terrainY !== null) {
      // If feet are at or below terrain, snap to terrain (falling down)
      if (this.position.y <= terrainY && this.velocity.y <= 0) {
        this.position.y = terrainY;
        this.velocity.y = 0;
      }
    }
    // Prevent falling below world
    const worldBottom = Terrain.WORLD_BOTTOM;
    if (this.position.y < worldBottom) {
      this.position.y = worldBottom;
      this.velocity.y = 0;
    }
  }

  canShoot(playerPos: Vector2): boolean {
    const { x: weaponX, y: weaponY } = this.getWeaponPosition();
    const dx = playerPos.x - weaponX;
    const dy = playerPos.y - weaponY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const now = Date.now();
    const enemyCooldown = now - this.lastShotTime > this.fireInterval;
    const weaponCooldown = this.weapon.canShoot();
    return distance <= this.shootingRange && enemyCooldown && weaponCooldown;
  }

  shoot(playerPos: Vector2): Bullet | null {
    this.lastShotTime = Date.now();
    // Compute aim angle toward player
    const { x: weaponX, y: weaponY } = this.getWeaponPosition();
    const dx = playerPos.x - weaponX;
    const dy = playerPos.y - weaponY;
    const aimAngle = Math.atan2(dy, dx * this.facing); // adjust for facing
    return this.weapon.shoot({
      position: this.getWeaponPosition(),
      facing: this.facing,
      aimAngle
    });
  }

  takeDamage(damage: number) {
    this.health = Math.max(0, this.health - damage);
    if (this.health <= 0) {
      this.active = false;
    }
  }

  getAbsoluteBounds() {
    return this.bounds.getAbsoluteBounds(this.position);
  }

  render(ctx: CanvasRenderingContext2D, playerPos?: Vector2) {
    if (!this.active) return;
    HumanFigure.render({
      ctx,
      position: this.position,
      active: this.active
    });
    // Compute aim angle toward player if playerPos is provided
    let aimAngle = 0;
    if (playerPos) {
      const { x: weaponX, y: weaponY } = this.getWeaponPosition();
      const dx = playerPos.x - weaponX;
      const dy = playerPos.y - weaponY;
      aimAngle = Math.atan2(dy, dx * this.facing); // adjust for facing
    }
    this.weapon.render({
      ctx,
      position: this.getWeaponPosition(),
      facing: this.facing,
      aimAngle,
      showAimLine: false
    });
    HealthBarFigure.render({
      ctx,
      centerPosition: {
        x: this.position.x,
        y: this.position.y + HumanFigure.FIGURE_HEIGHT + Enemy.HEALTHBAR_OFFSET_Y
      },
      health: this.health,
      maxHealth: this.maxHealth
    });
    BoundingBoxFigure.renderPositions(ctx, this.bounds.getBoundingPositions(this.position));
  }

  async waitForLoaded(): Promise<void> {
    await this.weapon.waitForLoaded();
    console.log(`Enemy loaded: ${this.id}`);
  }
}
