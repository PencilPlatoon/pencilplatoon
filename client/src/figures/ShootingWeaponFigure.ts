import { BoundingBox } from "../game/BoundingBox";
import { toCanvasY } from "../game/Terrain";
import { ShootingAimLineFigure } from "./ShootingAimLineFigure";
import { SVGInfo } from "../util/SVGLoader";
import { EntityTransform } from "../game/EntityTransform";
import { ShootingWeapon } from "../game/ShootingWeapon";
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
    const position = transform.position;

    ctx.save();
    ctx.translate(position.x, toCanvasY(position.y));
    ctx.rotate(transform.facing === 1 ? -transform.rotation : transform.rotation);
    ctx.scale(transform.facing, 1);
    
    // Calculate anchor point using boundingBox dimensions (which are display-scaled)
    const width = boundingBox.width;
    const height = boundingBox.height;
    const refX = width * boundingBox.refRatioPosition.x;
    const refY = height * boundingBox.refRatioPosition.y;
    
    // Debug logging (once per weapon type)
    if (typeof window !== 'undefined' && window.__DEBUG_MODE__ && !ShootingWeaponFigure.loggedWeapons.has(weapon.type.name)) {
      ShootingWeaponFigure.loggedWeapons.add(weapon.type.name);
      console.log('[ShootingWeaponFigure.renderSVG]', weapon.type.name, {
        svgOriginalDimensions: { width: svgInfo.boundingBox.width, height: svgInfo.boundingBox.height },
        boundingBoxDimensions: { width, height },
        refRatioPosition: { x: boundingBox.refRatioPosition.x, y: boundingBox.refRatioPosition.y },
        anchor: { x: refX, y: refY },
        drawPosition: { x: -refX, y: refY - height }
      });
    }
    
    // Draw SVG directly at display size (boundingBox dimensions)
    // In canvas coordinates (Y down), the top-left corner is at (refY - height)
    ctx.drawImage(svgInfo.image, -refX, refY - height, width, height);
    ctx.restore();
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
      
      ShootingAimLineFigure.render({
        ctx,
        transform: shootLineTransform
      });
    }
  }

} 