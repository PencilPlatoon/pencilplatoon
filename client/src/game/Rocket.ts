import { GameObject, RocketType, Holder } from "./types";
import { Vector2 } from "./Vector2";
import { BoundingBox } from "./BoundingBox";
import { Terrain } from "./Terrain";
import { EntityTransform } from "./EntityTransform";
import { RocketFigure } from "../figures/RocketFigure";
import { SVGInfo } from "../util/SVGLoader";
import { loadSVGAndCreateBounds } from "../util/SVGAssetLoader";
import { CollisionSystem } from "./CollisionSystem";

export class Rocket implements GameObject {
  private static readonly STABILIZER_ROTATION_SPEED = 30;
  private static readonly collisionSystem = new CollisionSystem();

  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  type: RocketType;
  svgInfo?: SVGInfo;
  isLoaded: boolean;
  stabilizerRotation: number = 0;
  isLaunched: boolean = false;
  explosionRadius: number;
  explosionDamage: number;
  
  public previousPosition: Vector2;
  private hasExploded = false;
  private _loadPromise: Promise<void>;
  
  public holder: Holder | null = null;
  private lastHolder: Holder | null = null;

  constructor(
    x: number,
    y: number,
    velocity: Vector2,
    rocketType: RocketType = Rocket.STANDARD_ROCKET,
    holder: Holder | null = null
  ) {
    this.id = `rocket_${Date.now()}_${Math.random()}`;
    this.transform = new EntityTransform({ x, y }, 0, 1);
    this.previousPosition = { x, y };
    this.velocity = velocity;
    this.holder = holder;
    this.type = rocketType;
    this.isLoaded = false;
    this.explosionRadius = rocketType.explosionRadius;
    this.explosionDamage = rocketType.damage;
    
    // Default bounding box
    this.bounds = new BoundingBox(rocketType.size, rocketType.size, { x: 0.5, y: 0.5 });
    this.active = true;
    
    this._loadPromise = loadSVGAndCreateBounds(rocketType, rocketType.size, { x: 0.5, y: 0.5 }).then(({ bounds, svgInfo }) => {
      this.bounds = bounds;
      this.svgInfo = svgInfo;
      this.isLoaded = true;
    });
  }

  update(deltaTime: number, terrain: Terrain) {
    if (!this.active || this.hasExploded) return;

    this.previousPosition = { x: this.transform.position.x, y: this.transform.position.y };

    // Rockets maintain velocity (propelled, no gravity)
    this.transform.position.x += this.velocity.x * deltaTime;
    this.transform.position.y += this.velocity.y * deltaTime;

    // Animate stabilizers only when launched
    if (this.isLaunched) {
      this.stabilizerRotation += deltaTime * Rocket.STABILIZER_ROTATION_SPEED;
    }

    // Check if rocket has cleared last holder's bounding box
    if (this.lastHolder) {
      const rocketBounds = this.bounds.getAbsoluteBounds(this.transform.position);
      const holderBounds = this.lastHolder.getAbsoluteBounds();
      // Check if rocket no longer overlaps with holder
      if (!Rocket.collisionSystem.checkCollision(rocketBounds, holderBounds)) {
        console.log(`[ROCKET] Cleared holder`);
        this.lastHolder = null; // Clear the reference once it's no longer needed
      }
    }

    // Check bounds first - deactivate if offscreen
    if (this.transform.position.x < 0 || this.transform.position.x >= Terrain.LEVEL_WIDTH || 
        this.transform.position.y < Terrain.WORLD_BOTTOM || this.transform.position.y > Terrain.WORLD_TOP + 100) {
      this.deactivate('out-of-bounds');
      return;
    }

    // Check terrain collision - explode on impact
    this.handleTerrainCollision(terrain);
  }

  private handleTerrainCollision(terrain: Terrain) {
    const terrainHeight = terrain.getHeightAt(this.transform.position.x);
    if (terrainHeight !== null) {
      const rocketBottom = this.transform.position.y - this.bounds.height / 2;
      
      if (rocketBottom <= terrainHeight) {
        // Hit terrain - explode immediately
        this.explode();
      }
    }
  }

  explode() {
    if (this.hasExploded) return;
    this.hasExploded = true;
    console.log(`[ROCKET] Exploding at (${this.transform.position.x.toFixed(1)}, ${this.transform.position.y.toFixed(1)})`);
    // The actual explosion damage will be handled by the GameEngine
    this.deactivate('exploded');
  }

  getEntityLabel(): string {
    return 'rocket';
  }

  getExplosionParameters() {
    return {
      position: this.transform.position,
      radius: this.explosionRadius,
      colors: ['#ff0000', '#ff4400', '#ff8800', '#ffcc00', '#ffff00', '#ffffff'],
      particleCount: 20
    };
  }

  getAbsoluteBounds() {
    if (this.holder) {
      const transform = this.holder.getPrimaryHandAbsTransform();
      return this.bounds.getAbsoluteBounds(transform.position);
    } else {
      return this.bounds.getAbsoluteBounds(this.transform.position);
    }
  }

  render(ctx: CanvasRenderingContext2D, transform: EntityTransform = this.transform) {
    RocketFigure.render({
      ctx,
      rocket: this,
      transform
    });
  }

  deactivate(reason: string) {
    console.log(`[ROCKET] deactivated:`, reason, 'x =', this.transform.position.x, 'y =', this.transform.position.y);
    this.active = false;
  }

  isExploded(): boolean {
    return this.hasExploded;
  }

  prepareForLaunch(
    x: number, 
    y: number, 
    velocity: Vector2, 
    holder: Holder
  ): void {
    // Get the full transform from the holder, including rotation
    const holderTransform = holder.getPrimaryHandAbsTransform();
    this.transform.position.x = holderTransform.position.x;
    this.transform.position.y = holderTransform.position.y;
    this.transform.rotation = holderTransform.rotation;
    this.transform.facing = holderTransform.facing;
    this.previousPosition = { x: holderTransform.position.x, y: holderTransform.position.y };
    this.velocity = velocity;
    this.active = true;
    this.hasExploded = false;
    this.isLaunched = true;
    this.stabilizerRotation = 0;
    // Once launched, position is independent - move holder to lastHolder
    this.holder = null;
    this.lastHolder = holder;
  }

  hasHolder(): boolean {
    return this.holder !== null;
  }

  hasLastHolder(): boolean {
    return this.lastHolder !== null;
  }

  async waitForLoaded(): Promise<void> {
    await this._loadPromise;
    console.log(`Rocket loaded: ${this.type.name}`);
  }

  static readonly STANDARD_ROCKET: RocketType = {
    name: "RPG-8 Rocket",
    damage: 150,
    explosionRadius: 250,
    speed: 400,
    size: 40,
    svgPath: "svg/rpg-8-rocket.svg",
  };

  static readonly ALL_ROCKETS: RocketType[] = [
    Rocket.STANDARD_ROCKET,
  ];
}

