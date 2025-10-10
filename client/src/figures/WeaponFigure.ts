import { WeaponType } from "../game/types";
import { BoundingBox } from "../game/BoundingBox";
import { toCanvasY } from "../game/Terrain";
import { ShootingAimLineFigure } from "./ShootingAimLineFigure";
import { SVGInfo } from "../util/SVGLoader";
import { EntityTransform } from "../game/EntityTransform";

export class WeaponFigure {
  static renderSVG({
    ctx,
    transform,
    weapon,
    svgInfo,
    boundingBox
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    weapon: WeaponType;
    svgInfo: SVGInfo;
    boundingBox: BoundingBox;
  }) {
    const position = transform.position;

    ctx.save();
    ctx.translate(position.x, toCanvasY(position.y));
    ctx.rotate(transform.facing === 1 ? -transform.rotation : transform.rotation);
    ctx.scale(transform.facing, 1);
    const svgWidth = svgInfo.boundingBox.width;
    const svgHeight = svgInfo.boundingBox.height;
    const scale = weapon.weaponLength / svgWidth;
    ctx.scale(scale, scale);
    const anchorX = svgWidth * boundingBox.relativeReferenceX;
    const anchorY = svgHeight * boundingBox.relativeReferenceY;
    ctx.drawImage(svgInfo.image, -anchorX, -anchorY, svgWidth, svgHeight);
    ctx.restore();
  }

  static renderBasic({
    ctx,
    transform,
    weapon
  }: {
    ctx: CanvasRenderingContext2D;
    transform: EntityTransform;
    weapon: WeaponType;
  }) {
    const position = transform.position;
    const weaponX = position.x;
    const weaponY = position.y;
    
    const weaponEndX = weaponX + Math.cos(transform.rotation) * weapon.weaponLength * transform.facing;
    const weaponEndY = weaponY + Math.sin(transform.rotation) * weapon.weaponLength;
    
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
    weapon: WeaponType;
    showAimLine?: boolean;
    svgInfo?: SVGInfo;
    boundingBox: BoundingBox;
  }) {
    if (svgInfo) {
      this.renderSVG({ ctx, transform, weapon, svgInfo, boundingBox });
    } else {
      this.renderBasic({ ctx, transform, weapon });
    }

    if (showAimLine && weapon.weaponCategory === 'gun') {
      const position = transform.position;
      const shootLineEndX = position.x + Math.cos(transform.rotation) * weapon.weaponLength * transform.facing;
      const shootLineEndY = position.y + Math.sin(transform.rotation) * weapon.weaponLength;
      const shootLineTransform = new EntityTransform({ x: shootLineEndX, y: shootLineEndY }, transform.rotation, transform.facing);
      
      ShootingAimLineFigure.render({
        ctx,
        transform: shootLineTransform
      });
    }
  }

} 