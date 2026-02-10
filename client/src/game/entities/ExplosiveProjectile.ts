import { ExplodingEntity, ExplosionParameters, SVGObjectType } from "@/game/types/interfaces";
import { Vector2 } from "@/game/types/Vector2";
import { BoundingBox } from "@/game/types/BoundingBox";
import { SVGInfo } from "@/util/SVGLoader";
import { loadSVGAndCreateBounds } from "@/util/SVGAssetLoader";
import { Projectile } from "./Projectile";

export abstract class ExplosiveProjectile extends Projectile implements ExplodingEntity {
  explosionRadius: number;
  explosionDamage: number;
  svgInfo?: SVGInfo;
  isLoaded: boolean = false;

  private hasExploded = false;
  protected _loadPromise: Promise<void> = Promise.resolve();

  constructor(
    id: string,
    x: number,
    y: number,
    velocity: Vector2,
    bounds: BoundingBox,
    explosionRadius: number,
    explosionDamage: number
  ) {
    super(id, x, y, velocity, bounds);
    this.explosionRadius = explosionRadius;
    this.explosionDamage = explosionDamage;
  }

  explode(): void {
    if (this.hasExploded) return;
    this.hasExploded = true;
    console.log(`[${this.getEntityLabel().toUpperCase()}] Exploding at (${this.transform.position.x.toFixed(1)}, ${this.transform.position.y.toFixed(1)})`);
    this.deactivate('exploded');
  }

  isExploded(): boolean {
    return this.hasExploded;
  }

  protected resetExplosionState(): void {
    this.hasExploded = false;
  }

  protected initSVGLoading(type: SVGObjectType, defaultHeight: number, refPosition: Vector2): void {
    this._loadPromise = loadSVGAndCreateBounds(type, defaultHeight, refPosition).then(({ bounds, svgInfo }) => {
      this.bounds = bounds;
      this.svgInfo = svgInfo;
      this.isLoaded = true;
    });
  }

  async waitForLoaded(): Promise<void> {
    await this._loadPromise;
    console.log(`${this.getEntityLabel()} loaded: ${this.getTypeName()}`);
  }

  abstract getExplosionParameters(): ExplosionParameters;
  abstract getEntityLabel(): string;
  protected abstract getTypeName(): string;
}
