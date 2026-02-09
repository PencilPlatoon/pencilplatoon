import { LauncherType, RocketType, GameObject, Holder, HoldableObject } from "./types";
import { Vector2 } from "./Vector2";
import { BoundingBox } from "./BoundingBox";
import { SVGInfo } from "../util/SVGLoader";
import { loadSVGAndCreateBounds } from "../util/SVGAssetLoader";
import { Rocket } from "./Rocket";
import { ALL_ROCKETS, STANDARD_ROCKET } from "./WeaponCatalog";
import { EntityTransform } from "./EntityTransform";
import { LaunchingWeaponFigure } from "../figures/LaunchingWeaponFigure";

export class LaunchingWeapon implements GameObject, Holder, HoldableObject {
  // GameObject interface fields
  id: string;
  transform: EntityTransform;
  velocity: Vector2;
  bounds: BoundingBox;
  active: boolean;
  previousPosition: Vector2;
  
  // LaunchingWeapon specific fields
  type: LauncherType;
  rocketType: RocketType;
  svgInfo?: SVGInfo;
  isLoaded: boolean;
  heldRocket: Rocket | null = null;
  private _loadPromise: Promise<void>;
  public holder: Holder | null = null;

  constructor(launcherType: LauncherType) {
    // Initialize GameObject fields
    this.id = `launcher_${Date.now()}_${Math.random()}`;
    this.transform = new EntityTransform({ x: 0, y: 0 }, 0, 1);
    this.velocity = { x: 0, y: 0 };
    this.previousPosition = { x: 0, y: 0 };
    this.active = true;
    
    // Initialize LaunchingWeapon fields
    this.type = launcherType;
    this.isLoaded = false;
    this._loadPromise = Promise.resolve();

    // Resolve rocket type from string
    const rocketTypeName = launcherType.rocketType;
    const matchingRocket = ALL_ROCKETS.find(r => r.name === rocketTypeName);
    this.rocketType = matchingRocket || STANDARD_ROCKET;

    // Default bounding box
    this.bounds = new BoundingBox(
      launcherType.size,
      10,
      launcherType.primaryHoldRatioPosition
    );

    this._loadPromise = loadSVGAndCreateBounds(launcherType, 10, launcherType.primaryHoldRatioPosition).then(({ bounds, svgInfo }) => {
      this.bounds = bounds;
      this.svgInfo = svgInfo;
      this.isLoaded = true;
    });

    this.heldRocket = new Rocket(0, 0, { x: 0, y: 0 }, this.rocketType, this);
  }

  canLaunch(newTriggerPress: boolean): boolean {
    return this.heldRocket !== null && newTriggerPress;
  }

  launch(transform: EntityTransform): Rocket | null {
    if (!this.heldRocket) return null;

    const rocketTransform = this.getMuzzleTransform(transform);
    const direction = { x: Math.cos(rocketTransform.rotation) * rocketTransform.facing, y: Math.sin(rocketTransform.rotation) };
    
    // Prepare rocket for launch (launcher's transform should already be set by caller)
    const velocity = {
      x: direction.x * this.rocketType.speed,
      y: direction.y * this.rocketType.speed
    };
    
    this.heldRocket.prepareForLaunch(rocketTransform.position.x, rocketTransform.position.y, velocity, this);
    
    const launchedRocket = this.heldRocket;
    this.heldRocket = null;
    
    return launchedRocket;
  }

  loadRocket(rocket: Rocket): void {
    this.heldRocket = rocket;
  }

  getCapacity(): number {
    return this.type.capacity;
  }

  getMuzzleTransform(weaponTransform: EntityTransform): EntityTransform {
    // Distance from reference point to right edge of weapon
    const distanceToRightEdge = (1 - this.bounds.refRatioPosition.x) * this.bounds.width;
    
    const endX = weaponTransform.position.x + Math.cos(weaponTransform.rotation) * distanceToRightEdge * weaponTransform.facing;
    const endY = weaponTransform.position.y + Math.sin(weaponTransform.rotation) * distanceToRightEdge;
    
    return new EntityTransform(
      { x: endX, y: endY },
      weaponTransform.rotation,
      weaponTransform.facing
    );
  }

  getAbsoluteBounds() {
    if (this.holder) {
      const transform = this.holder.getPrimaryHandAbsTransform();
      return this.bounds.getAbsoluteBounds(transform.position);
    } else {
      return this.bounds.getAbsoluteBounds(this.transform.position);
    }
  }

  getPrimaryHandAbsTransform(): EntityTransform {
    const selfAbsTransform = this.holder?.getPrimaryHandAbsTransform() || this.transform;
    return this.getMuzzleTransform(selfAbsTransform);
  }

  render(ctx: CanvasRenderingContext2D, transform: EntityTransform, showAimLine: boolean = true) {
    LaunchingWeaponFigure.render({
      ctx,
      transform,
      launcher: this,
      showAimLine
    });

    if (this.heldRocket) {
      const rocketTransform = this.getMuzzleTransform(transform);
      this.heldRocket.render(ctx, rocketTransform);
    }
  }

  async waitForLoaded(): Promise<void> {
    await this._loadPromise;
    console.log(`LaunchingWeapon loaded: ${this.type.name}`);
  }

  updatePrimaryHoldRatioPosition(ratioPosition: Vector2): void {
    this.type.primaryHoldRatioPosition = ratioPosition;
    this.bounds.refRatioPosition = ratioPosition;
  }

  updateSecondaryHoldRatioPosition(ratioPosition: Vector2): void {
    this.type.secondaryHoldRatioPosition = ratioPosition;
  }
}

