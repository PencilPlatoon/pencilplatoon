import { BoundingBox } from "../game/types/BoundingBox";
import { toCanvasY } from "../game/world/Terrain";
import { StraightAimLineFigure } from "./StraightAimLineFigure";
import { renderSVGAtTransform } from "./SVGRendering";
import { SVGInfo } from "../util/SVGLoader";
import { EntityTransform } from "../game/types/EntityTransform";
import { ShootingWeapon } from "../game/weapons/ShootingWeapon";
import { BoundingBoxFigure } from "./BoundingBoxFigure";

export class ShootingWeaponFigure {
  private static loggedWeapons = new Set<string>();

  static renderSVG({
    ctx,
    transform,
    weapon,
    svgInfo,
    boundingBox
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    weapon: ShootingWeapon;
    svgInfo: SVGInfo;
    boundingBox: BoundingBox;
  }) {
    // Debug logging (once per weapon type)
    if (typeof window !== 'undefined' && window.__DEBUG_MODE__ && !ShootingWeaponFigure.loggedWeapons.has(weapon.type.name)) {
      ShootingWeaponFigure.loggedWeapons.add(weapon.type.name);
      console.log('[ShootingWeaponFigure.renderSVG]', weapon.type.name, {
        svgOriginalDimensions: { width: svgInfo.boundingBox.width, height: svgInfo.boundingBox.height },
        boundingBoxDimensions: { width: boundingBox.width, height: boundingBox.height },
        refRatioPosition: { x: boundingBox.refRatioPosition.x, y: boundingBox.refRatioPosition.y },
      });
    }

    renderSVGAtTransform({ ctx, transform, svgInfo, boundingBox });
  }

  static renderBasic({
    ctx,
    transform,
    weapon
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    weapon: ShootingWeapon;
  }) {
    const position = transform.position;
    const weaponX = position.x;
    const weaponY = position.y;
    
    const weaponEndX = weaponX + Math.cos(transform.rotation) * weapon.type.size * transform.facing;
    const weaponEndY = weaponY + Math.sin(transform.rotation) * weapon.type.size;
    
    ctx.save();
    ctx.strokeStyle = "black";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(weaponX, toCanvasY(weaponY));
    ctx.lineTo(weaponEndX, toCanvasY(weaponEndY));
    ctx.stroke();
    ctx.restore();
  }

  static render({
    ctx,
    transform,
    weapon,
    showAimLine = false,
    svgInfo,
    boundingBox
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    weapon: ShootingWeapon;
    showAimLine?: boolean;
    svgInfo?: SVGInfo;
    boundingBox: BoundingBox;
  }) {
    if (svgInfo) {
      this.renderSVG({ ctx, transform, weapon, svgInfo, boundingBox });
    } else {
      this.renderBasic({ ctx, transform, weapon });
    }

    // Debug: render bounding box
    BoundingBoxFigure.renderRotated({ ctx, boundingBox, transform });

    if (showAimLine) {
      const position = transform.position;
      const shootLineEndX = position.x + Math.cos(transform.rotation) * weapon.type.size * transform.facing;
      const shootLineEndY = position.y + Math.sin(transform.rotation) * weapon.type.size;
      const shootLineTransform = new EntityTransform({ x: shootLineEndX, y: shootLineEndY }, transform.rotation, transform.facing);
      
      StraightAimLineFigure.render({
        ctx,
        transform: shootLineTransform,
        length: 100
      });
    }
  }

} 